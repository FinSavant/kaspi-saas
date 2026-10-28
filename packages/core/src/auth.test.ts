import { describe, expect, it } from 'vitest';
import { hashPassword, newSessionToken, sessionTokenHash, verifyPassword } from './auth';

describe('auth', () => {
  it('verifies the right password only', () => {
    const stored = hashPassword('секрет-123');
    expect(verifyPassword('секрет-123', stored)).toBe(true);
    expect(verifyPassword('секрет-124', stored)).toBe(false);
    expect(verifyPassword('anything', '!')).toBe(false);
  });

  it('stores only the token hash', () => {
    const { token, tokenHash } = newSessionToken();
    expect(tokenHash).toBe(sessionTokenHash(token));
    expect(tokenHash).not.toContain(token);
  });
});
