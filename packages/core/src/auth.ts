import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** Пароль хранится как scrypt$<соль>$<хеш>; сам пароль нигде не сохраняется. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(password, Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Новый токен сессии для куки и его SHA-256 для базы. */
export function newSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: sessionTokenHash(token) };
}

export const sessionTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export const SESSION_DAYS = 30;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const MIN_PASSWORD_LENGTH = 8;
