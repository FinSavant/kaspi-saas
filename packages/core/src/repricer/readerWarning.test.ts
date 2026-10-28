import { describe, expect, it } from 'vitest';
import { readerWarning } from './snapshot';

describe('readerWarning', () => {
  const now = Date.parse('2026-10-22T15:00:00Z');
  it('is silent while prices keep coming', () => {
    expect(readerWarning(now - 5 * 60_000, now)).toBeNull();
  });
  it('says since when the robot stands, in Almaty time', () => {
    expect(readerWarning(Date.parse('2026-10-21T19:01:00Z'), now)).toContain('с 22.10, 00:01');
    expect(readerWarning(null, now)).toContain('ещё ни разу');
  });
});
