import {
  QUEUES,
  READER_LAST_SEEN_KEY,
  readerWarning,
  redisConnectionFromUrl,
  verifyTelegramLinkCode,
  type ChatAgentJob,
  type ReportJob,
  type WaybillLayout,
  type WaybillsJob,
} from '@kaspi/core';
import { prisma } from '@kaspi/db';
import { Queue } from 'bullmq';
import { Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

const bot = new Telegraf(token);
const connection = redisConnectionFromUrl(process.env.REDIS_URL ?? 'redis://localhost:6379');
const waybillsQueue = new Queue<WaybillsJob>(QUEUES.waybills, { connection });
const reportsQueue = new Queue<ReportJob>(QUEUES.reports, { connection });
const chatAgentQueue = new Queue<ChatAgentJob>(QUEUES.chatAgent, { connection });

// Чат привязывается к пользователю по ссылке из «Настроек» кабинета:
// t.me/<бот>?start=<код>, код подписан секретом API_INTERNAL_KEY.
const linkSecret = process.env.API_INTERNAL_KEY;
if (!linkSecret) throw new Error('API_INTERNAL_KEY is required');

async function linkChat(chatId: number, code: string): Promise<string | null> {
  const users = await prisma.user.findMany({ select: { id: true } });
  const user = users.find((u) => verifyTelegramLinkCode(u.id, code, linkSecret!));
  if (!user) return null;
  // Чат может быть привязан только к одному пользователю
  await prisma.user.updateMany({ where: { telegramChatId: String(chatId) }, data: { telegramChatId: null } });
  const linked = await prisma.user.update({
    where: { id: user.id },
    data: { telegramChatId: String(chatId) },
    include: { shops: { select: { name: true } } },
  });
  return linked.shops.map((s) => s.name).join(', ') || 'магазинов пока нет';
}

async function shopsForChat(chatId: number) {
  const user = await prisma.user.findUnique({
    where: { telegramChatId: String(chatId) },
    include: { shops: true },
  });
  return user?.shops ?? null;
}

const NOT_LINKED = 'Этот чат не привязан к кабинету. Откройте «Настройки» → «Telegram» и нажмите «Подключить Telegram».';

const HELP = [
  'Каждое утро в 09:10 пришлю отчёт за вчера: заказы, выдачи, сколько поступит на счёт и какие товары заканчиваются.',
  '',
  '/report — прислать отчёт за вчера сейчас',
  '/print — склеить накладные из «Передачи» для термопринтера (/print 4 — A4 по 4 на листе)',
  '/repricer_on — запустить робота на выбранных товарах',
  '/repricer_off — поставить робота на паузу',
  '/chat — войти в чат Kaspi для «Отзывов» (код из SMS)',
].join('\n');

bot.start(async (ctx) => {
  const code = ctx.payload?.trim();
  // Вход на сайт SANQ: подтверждение кнопкой, чтобы чужая ссылка не впустила в аккаунт молча
  if (code?.startsWith('login_')) {
    return ctx.reply('Войти на сайт SANQ под этим Telegram? Если вы сейчас не входили на сайт, не нажимайте.', {
      reply_markup: { inline_keyboard: [[{ text: '✅ Подтвердить вход', callback_data: `tglogin:${code.slice('login_'.length)}` }]] },
    });
  }
  if (code) {
    const shops = await linkChat(ctx.chat.id, code);
    return ctx.reply(shops ? `Telegram подключён. Магазины: ${shops}.\n\n${HELP}` : 'Ссылка недействительна. Возьмите новую в «Настройках» кабинета.');
  }
  return ctx.reply((await shopsForChat(ctx.chat.id)) ? HELP : NOT_LINKED);
});

bot.command('report', async (ctx) => {
  if (!(await shopsForChat(ctx.chat.id))) return ctx.reply(NOT_LINKED);
  await reportsQueue.add('now', { chatId: String(ctx.chat.id) }, { removeOnComplete: 20, removeOnFail: 20 });
  return ctx.reply('Собираю отчёт, это около минуты.');
});

const LAYOUTS: Record<string, WaybillLayout> = { thermal: 'thermal', '4': 'a4x4', '8': 'a4x8' };

// /print, /print 8, /print thermal
bot.command('print', async (ctx) => {
  const shops = await shopsForChat(ctx.chat.id);
  if (!shops) return ctx.reply(NOT_LINKED);
  if (shops.length === 0) return ctx.reply('К аккаунту не подключён ни один магазин.');

  // По умолчанию — термопринтер; /print 4 и /print 8 — листы A4
  const arg = ctx.message.text.split(/\s+/)[1] ?? 'thermal';
  const layout = LAYOUTS[arg];
  if (!layout) return ctx.reply('Формат: /print (термопринтер), /print 4 или /print 8');

  await waybillsQueue.addBulk(
    shops.map((shop) => ({
      name: 'print',
      data: { shopId: shop.id, layout, sort: 'product', telegramChatId: String(ctx.chat.id) },
    })),
  );
  return ctx.reply('Собираю накладные, пришлю файл сюда.');
});

async function readerLastSeen(): Promise<number | null> {
  const value = await (await reportsQueue.client).get(READER_LAST_SEEN_KEY);
  return value ? Number(value) : null;
}

async function setRepricer(chatId: number, enabled: boolean): Promise<string> {
  const shops = await shopsForChat(chatId);
  if (!shops) return NOT_LINKED;

  // Общая пауза по магазину: выбор товаров, на которых включён бот, не меняется
  const shopIds = shops.map((s) => s.id);
  await prisma.shop.updateMany({ where: { id: { in: shopIds } }, data: { repricerEnabled: enabled } });
  const selected = await prisma.repricerSetting.count({
    where: { enabled: true, product: { shopId: { in: shopIds } } },
  });
  if (!enabled) return `Робот на паузе. Выбранные товары (${selected}) сохранены.`;
  // «Включён» ещё не значит «работает»: без цен конкурентов с компьютера робот стоит
  const warning = readerWarning(await readerLastSeen());
  return warning ? `Робот включён на ${selected} товарах, но ${warning.replace(/^⚠️ Робот стоит: /, '')}` : `Робот работает. Товаров, на которых он включён: ${selected}.`;
}

bot.command('repricer_on', async (ctx) => ctx.reply(await setRepricer(ctx.chat.id, true)));
bot.command('repricer_off', async (ctx) => ctx.reply(await setRepricer(ctx.chat.id, false)));

// Повторный вход в чат Kaspi для «Отзывов»: кнопка → Kaspi шлёт SMS → код присылают сюда.
// Начатый вход живёт в api (там клиент с куками), здесь — только какой магазин ждёт код.
const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const CODE_WAIT_MS = 15 * 60_000;
const waitingCode = new Map<number, { shopId: string; shopName: string; at: number }>();

async function callApi(path: string, body: unknown): Promise<{ ok: boolean; data: any }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'x-api-key': linkSecret!, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: await res.json().catch(() => null) };
}

async function startChatLogin(chatId: number, shopId: string): Promise<string> {
  const shop = (await shopsForChat(chatId))?.find((s) => s.id === shopId);
  if (!shop) return NOT_LINKED;
  if (!shop.chatPhone) return `${shop.name}: номер для чата не подключён — войдите в «Настройках» → «Чат с покупателями».`;
  const { ok, data } = await callApi(`/shops/${shop.id}/chat/login`, {});
  if (!ok) return `${shop.name}: ${data?.error ?? 'Kaspi не отправил SMS.'}`;
  waitingCode.set(chatId, { shopId: shop.id, shopName: shop.name, at: Date.now() });
  return `${shop.name}: Kaspi отправил SMS на ${data?.sentTo ?? 'ваш номер'}. Пришлите код из SMS сюда.`;
}

bot.action(/^tglogin:([0-9a-f]+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const { ok, data } = await callApi('/auth/telegram/confirm', {
    code: ctx.match[1],
    chatId: String(ctx.chat!.id),
    name: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' '),
  });
  await ctx.editMessageReplyMarkup(undefined).catch(() => null);
  if (!ok) return ctx.reply(data?.error ?? 'Не удалось войти. Попробуйте ещё раз.');
  return ctx.reply(
    data?.created
      ? '✅ Аккаунт SANQ создан, 5 дней бесплатно. Вернитесь в браузер — вход выполнится сам.'
      : '✅ Вход подтверждён. Вернитесь в браузер — вход выполнится сам.',
  );
});

bot.action(/^chat:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply(await startChatLogin(ctx.chat!.id, ctx.match[1]!));
});

// /chat — кнопки входа для всех магазинов, если нужно войти без уведомления
bot.command('chat', async (ctx) => {
  const shops = await shopsForChat(ctx.chat.id);
  if (!shops) return ctx.reply(NOT_LINKED);
  const withPhone = shops.filter((s) => s.chatPhone);
  if (withPhone.length === 0) return ctx.reply('Чат ни в одном магазине не подключён — войдите в «Настройках» → «Чат с покупателями».');
  return ctx.reply('Вход в чат Kaspi для «Отзывов». Выберите магазин:', {
    reply_markup: { inline_keyboard: withPhone.map((s) => [{ text: `🔑 ${s.name}${s.chatSessionEnc ? ' (сейчас подключён)' : ''}`, callback_data: `chat:${s.id}` }]) },
  });
});

// Ответ владельца реплаем на вопрос агента-ответчика: уходит покупателю в чат и запоминается.
// Раньше проверки кода из SMS: ответом может быть и просто число (цена, количество).
bot.on('text', async (ctx, next) => {
  const replied = ctx.message.reply_to_message;
  const text = ctx.message.text.trim();
  if (!replied || text.startsWith('/')) return next();
  const escalation = await prisma.chatEscalation.findFirst({
    where: { telegramChatId: String(ctx.chat.id), telegramMsgId: String(replied.message_id) },
  });
  if (!escalation) return next();
  if (escalation.status !== 'PENDING') return ctx.reply('На этот вопрос уже ответили.');
  const claimed = await prisma.chatEscalation.updateMany({
    where: { id: escalation.id, status: 'PENDING' },
    data: { status: 'ANSWERED', answer: text.slice(0, 700), answeredAt: new Date() },
  });
  if (claimed.count === 0) return ctx.reply('На этот вопрос уже ответили.');
  await chatAgentQueue.add('deliver', { escalationId: escalation.id }, { removeOnComplete: 50, removeOnFail: 50 });
  return ctx.reply('Отправляю покупателю и запоминаю ответ.');
});

bot.hears(/^\s*\d{4,8}\s*$/, async (ctx) => {
  const waiting = waitingCode.get(ctx.chat.id);
  if (!waiting || Date.now() - waiting.at > CODE_WAIT_MS) {
    waitingCode.delete(ctx.chat.id);
    return ctx.reply('Сейчас код не ждём. Чтобы войти в чат, нажмите кнопку в уведомлении или отправьте /chat.');
  }
  const { ok, data } = await callApi(`/shops/${waiting.shopId}/chat/code`, { code: ctx.message.text.trim() });
  // Неверный код можно прислать ещё раз, пока вход не устарел
  if (ok || /устарел/.test(data?.error ?? '')) waitingCode.delete(ctx.chat.id);
  return ctx.reply(ok ? `✅ ${waiting.shopName}: чат подключён, рассылка «Отзывов» продолжится.` : `${waiting.shopName}: ${data?.error ?? 'не удалось войти.'}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

await bot.launch();
