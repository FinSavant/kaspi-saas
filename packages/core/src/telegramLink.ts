import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Код привязки Telegram-чата к пользователю для ссылки t.me/<бот>?start=<код>.
 * Подписан общим секретом, поэтому подобрать код к чужому аккаунту нельзя.
 */
export function telegramLinkCode(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`telegram-link:${userId}`).digest('hex').slice(0, 24);
}

export function verifyTelegramLinkCode(userId: string, code: string, secret: string): boolean {
  const expected = Buffer.from(telegramLinkCode(userId, secret));
  const given = Buffer.from(code);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
