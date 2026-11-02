import { describe, expect, it } from 'vitest';
import { DEFAULT_BACKOFF, growingPause, onBlocked, parsePauses } from './price-reader-backoff';

describe('onBlocked', () => {
  it('паузы растут и упираются в потолок', () => {
    const minutes = [1, 2, 3, 4, 5].map((n) => (onBlocked(n, { ...DEFAULT_BACKOFF, maxBlockedCycles: 99 }) as any).pauseMs / 60_000);
    expect(minutes).toEqual([5, 10, 20, 40, 60]);
    expect((onBlocked(9, { ...DEFAULT_BACKOFF, maxBlockedCycles: 99 }) as any).pauseMs).toBe(60 * 60_000);
  });
  it('останавливает опрос после лимита подряд идущих блокировок', () => {
    expect(onBlocked(5).action).toBe('pause');
    expect(onBlocked(6).action).toBe('stop');
  });
});

describe('growingPause', () => {
  it('удваивается и ограничена потолком', () => {
    expect(growingPause(1, 60_000, 900_000)).toBe(60_000);
    expect(growingPause(3, 60_000, 900_000)).toBe(240_000);
    expect(growingPause(20, 60_000, 900_000)).toBe(900_000);
  });
});

describe('parsePauses', () => {
  it('разбирает список и отбрасывает мусор', () => {
    expect(parsePauses('5, 10,x,-1,20')).toEqual([5, 10, 20]);
    expect(parsePauses('')).toBeNull();
    expect(parsePauses('abc')).toBeNull();
  });
});
