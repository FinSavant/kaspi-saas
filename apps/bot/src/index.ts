import {
  QUEUES,
  redisConnectionFromUrl,
  verifyTelegramLinkCode,
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
].join('\n');

bot.start(async (ctx) => {
  const code = ctx.payload?.trim();
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

async function setRepricer(chatId: number, enabled: boolean): Promise<string> {
  const shops = await shopsForChat(chatId);
  if (!shops) return NOT_LINKED;

  // Общая пауза по магазину: выбор товаров, на которых включён бот, не меняется
  const shopIds = shops.map((s) => s.id);
  await prisma.shop.updateMany({ where: { id: { in: shopIds } }, data: { repricerEnabled: enabled } });
  const selected = await prisma.repricerSetting.count({
    where: { enabled: true, product: { shopId: { in: shopIds } } },
  });
  return enabled
    ? `Робот работает. Товаров, на которых он включён: ${selected}.`
    : `Робот на паузе. Выбранные товары (${selected}) сохранены.`;
}

bot.command('repricer_on', async (ctx) => ctx.reply(await setRepricer(ctx.chat.id, true)));
bot.command('repricer_off', async (ctx) => ctx.reply(await setRepricer(ctx.chat.id, false)));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

await bot.launch();
