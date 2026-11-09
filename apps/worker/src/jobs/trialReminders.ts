import { prisma } from '@kaspi/db';
import { sendTelegramMessage, type TelegramButton } from '../telegram';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ALMATY_OFFSET_MS = 5 * HOUR_MS;
/** Писать клиентам только днём по Алматы, чтобы не будить сообщениями. */
const SEND_FROM_HOUR = 9;
const SEND_TO_HOUR = 21;
/** «Скоро закончится» — за сутки до конца; «закончился» — не позже недели после конца. */
const SOON_BEFORE_MS = DAY_MS;
const EXPIRED_MAX_AGE_MS = 7 * DAY_MS;
/** Второе, мягкое напоминание — через 3 дня после окончания. */
const FOLLOW_UP_AFTER_MS = 3 * DAY_MS;

const whatsappNumber = () => (process.env.SANQ_WHATSAPP ?? '').replace(/\D/g, '') || '77064040416';
const waLink = (text: string) => `https://wa.me/${whatsappNumber()}?text=${encodeURIComponent(text)}`;

const PRICES = [
  '• Старт — 9 900 ₸/мес: робот цен и предзаказ до 50 товаров, накладные, сборка, аналитика',
  '• Pro — 15 900 ₸/мес: до 2 магазинов, робот и предзаказ до 120 товаров, отзывы включены',
  '• Только отзывы — 4 999 ₸/мес: просьбы об отзывах и агент, который отвечает покупателям за 1 минуту',
].join('\n');

export const TRIAL_TEXTS = {
  soon: (name: string) =>
    `${name}, ваш пробный период в SANQ заканчивается завтра.\n\n` +
    `Как вам первые дни? Получилось настроить робота цен, посмотреть аналитику и накладные? Если что-то непонятно или не работает, напишите нам в WhatsApp, поможем.\n\n` +
    `Чтобы доступ не прервался, выберите тариф:\n${PRICES}\n\nНажмите кнопку ниже, оформим за пару минут.`,
  expired: (name: string) =>
    `${name}, ваш пробный период в SANQ закончился, доступ и робот цен приостановлены.\n\n` +
    `Как прошло, понравилось? Напишите, что было полезно и чего не хватило, нам важно ваше мнение.\n\n` +
    `Хотите продолжить, тарифы:\n${PRICES}\n\nНе успели разобраться? Можем продлить пробный период.`,
  followUp: (name: string) =>
    `${name}, это снова SANQ. Мы остановили доступ после пробного периода, но все ваши данные сохранены.\n\n` +
    `Вернуться можно в любой момент: Старт от 9 900 ₸/мес, только отзывы 4 999 ₸/мес. Если что-то не устроило, ответьте нам в WhatsApp, постараемся исправить.`,
};

const BUTTONS: Record<'soon' | 'expired' | 'followUp', TelegramButton[]> = {
  soon: [
    { text: 'Выбрать тариф', url: waLink('Здравствуйте! Хочу выбрать тариф SANQ после пробного периода.') },
    { text: 'Нужна помощь с настройкой', url: waLink('Здравствуйте! Нужна помощь с настройкой SANQ.') },
  ],
  expired: [
    { text: 'Продолжить на тарифе Старт', url: waLink('Здравствуйте! Хочу подключить тариф Старт в SANQ.') },
    { text: 'Только отзывы 4 999 ₸', url: waLink('Здравствуйте! Хочу подключить тариф «Только отзывы» в SANQ.') },
    { text: 'Продлить пробный период', url: waLink('Здравствуйте! Прошу продлить пробный период в SANQ.') },
  ],
  followUp: [{ text: 'Вернуться в SANQ', url: waLink('Здравствуйте! Хочу вернуться в SANQ.') }],
};

function inSendWindow(now: Date): boolean {
  const hour = new Date(now.getTime() + ALMATY_OFFSET_MS).getUTCHours();
  return hour >= SEND_FROM_HOUR && hour < SEND_TO_HOUR;
}

/** Ошибки «бот заблокирован» / «чат не найден» повторять бессмысленно: считаем доставленным. */
function isPermanent(error: unknown): boolean {
  return /failed with (400|403)/.test(error instanceof Error ? error.message : String(error));
}

type Kind = 'soon' | 'expired' | 'followUp';
const SENT_FIELD = { soon: 'trialSoonSentAt', expired: 'trialExpiredSentAt', followUp: 'trialFollowUpSentAt' } as const;

async function deliver(sub: { id: string; user: { telegramChatId: string | null; name: string | null } }, kind: Kind): Promise<boolean> {
  const name = sub.user.name?.trim() || 'Здравствуйте';
  try {
    await sendTelegramMessage(sub.user.telegramChatId!, TRIAL_TEXTS[kind](name), BUTTONS[kind]);
  } catch (error) {
    if (!isPermanent(error)) {
      console.warn(`[trial] ${kind} to ${sub.id} failed, will retry`, error instanceof Error ? error.message : error);
      return false;
    }
  }
  await prisma.subscription.update({ where: { id: sub.id }, data: { [SENT_FIELD[kind]]: new Date() } });
  return true;
}

/** Напоминания пробным клиентам: за сутки до конца, после конца и через 3 дня. Оплатившим не пишем. */
export async function sendTrialReminders(now = new Date()) {
  const result = { soon: 0, expired: 0, followUp: 0 };
  if (!inSendWindow(now)) return result;

  // Только пробные подписки: без оплаты, не владелец платформы, Telegram привязан
  const base = { paidUntil: null, user: { isAdmin: false, telegramChatId: { not: null } } } as const;
  const include = { user: { select: { telegramChatId: true, name: true } } } as const;

  const soon = await prisma.subscription.findMany({
    where: { ...base, trialSoonSentAt: null, trialEndsAt: { gt: now, lte: new Date(now.getTime() + SOON_BEFORE_MS) } },
    include,
  });
  for (const sub of soon) if (await deliver(sub, 'soon')) result.soon++;

  const expired = await prisma.subscription.findMany({
    where: { ...base, trialExpiredSentAt: null, trialEndsAt: { lte: now, gt: new Date(now.getTime() - EXPIRED_MAX_AGE_MS) } },
    include,
  });
  for (const sub of expired) if (await deliver(sub, 'expired')) result.expired++;

  const followUp = await prisma.subscription.findMany({
    where: {
      ...base,
      trialExpiredSentAt: { not: null, lte: new Date(now.getTime() - FOLLOW_UP_AFTER_MS) },
      trialFollowUpSentAt: null,
    },
    include,
  });
  for (const sub of followUp) if (await deliver(sub, 'followUp')) result.followUp++;

  return result;
}
