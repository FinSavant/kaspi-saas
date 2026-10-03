import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function parseKey(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes in hex (64 characters)');
  }
  return key;
}

/** AES-256-GCM; результат — base64 от iv | tag | ciphertext. */
export function encryptSecret(plain: string, keyHex: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', parseKey(keyHex), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptSecret(encrypted: string, keyHex: string): string {
  const raw = Buffer.from(encrypted, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', parseKey(keyHex), raw.subarray(0, IV_LENGTH));
  decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
  return Buffer.concat([decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]).toString('utf8');
}
