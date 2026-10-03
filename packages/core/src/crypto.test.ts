import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './crypto';

describe('encryptSecret / decryptSecret', () => {
  const key = randomBytes(32).toString('hex');

  it('round-trips a token', () => {
    const encrypted = encryptSecret('kaspi-token-123', key);
    expect(encrypted).not.toContain('kaspi-token-123');
    expect(decryptSecret(encrypted, key)).toBe('kaspi-token-123');
  });

  it('fails with a different key', () => {
    const encrypted = encryptSecret('kaspi-token-123', key);
    expect(() => decryptSecret(encrypted, randomBytes(32).toString('hex'))).toThrow();
  });

  it('rejects a key of the wrong length', () => {
    expect(() => encryptSecret('x', 'abcd')).toThrow(/32 bytes/);
  });
});
