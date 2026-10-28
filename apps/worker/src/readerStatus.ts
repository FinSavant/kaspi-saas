import { QUEUES, READER_LAST_SEEN_KEY, readerWarning, redisConnectionFromUrl } from '@kaspi/core';
import { prisma } from '@kaspi/db';
import { Queue } from 'bullmq';
import { sendTelegramMessage } from './telegram';

/** Отдельная очередь только ради подключения к Redis — та же база, что у api. */
const queue = new Queue(QUEUES.reports, { connection: redisConnectionFromUrl(process.env.REDIS_URL ?? 'redis://localhost:6379') });
const ALERTED_KEY = 'reader:alerted';
/** Молчание дольше этого — пишем в Telegram (короткие перерывы не тревожим). */
const ALERT_AFTER_MS = 30 * 60_000;

export async function readerLastSeen(): Promise<number | null> {
  const value = await (await queue.client).get(READER_LAST_SEEN_KEY);
  return value ? Number(value) : null;
}

const almatyHour = (now: Date) => Number(now.toLocaleString('en-GB', { timeZone: 'Asia/Almaty', hour: '2-digit', hour12: false }));

/**
 * Раз в несколько минут: если читатель цен на компьютере молчит дольше 30 минут, а робот
 * где-то включён — одно сообщение в Telegram; когда цены снова пошли — одно «восстановлено».
 * Ночью (23:00–08:00) не пишем: сообщение придёт утром, если компьютер так и не включили.
 */
export async function checkReaderAlive(now = new Date()): Promise<string> {
  const redis = await queue.client;
  const lastSeen = await readerLastSeen();
  const alerted = (await redis.get(ALERTED_KEY)) === '1';
  const silent = lastSeen === null || now.getTime() - lastSeen > ALERT_AFTER_MS;

  if (!silent) {
    if (!alerted) return 'ok';
    await redis.del(ALERTED_KEY);
    await notifyOwners('✅ Цены конкурентов снова приходят — робот работает.');
    return 'recovered';
  }
  if (alerted) return 'still silent, already alerted';
  const hour = almatyHour(now);
  if (hour >= 23 || hour < 8) return 'silent, quiet hours';
  if ((await prisma.repricerSetting.count({ where: { enabled: true, product: { shop: { repricerEnabled: true } } } })) === 0) return 'silent, robot off';

  await notifyOwners(readerWarning(lastSeen, now.getTime())!);
  await redis.set(ALERTED_KEY, '1');
  return 'alerted';
}

async function notifyOwners(text: string) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  const users = await prisma.user.findMany({ where: { telegramChatId: { not: null } }, select: { telegramChatId: true } });
  for (const u of users) await sendTelegramMessage(u.telegramChatId!, text).catch(() => undefined);
}
