import { describe, expect, it, vi } from 'vitest';
import { nextStreak, runCycle, type CycleResult } from './price-reader-cycle';

const tasks = (n: number) => Array.from({ length: n }, (_, i) => ({ masterSku: String(i + 1) }));
const httpError = (status: number) => Object.assign(new Error(`Kaspi storefront responded with ${status}`), { status });
const log = () => ({ warn: vi.fn() });

/** reader, который отвечает по карточкам по списку: 'ok' или статус ошибки. */
const reader = (plan: (number | 'ok')[]) =>
  vi.fn(async (task: { masterSku: string }) => {
    const step = plan[Number(task.masterSku) - 1];
    if (step !== 'ok') throw typeof step === 'number' ? httpError(step) : new Error('no plan');
  });

describe('runCycle', () => {
  it('одиночный 405: карточка пропущена, остальные прочитаны, цикл ok', async () => {
    const read = reader(['ok', 405, 'ok', 'ok']);
    const l = log();
    const result = await runCycle(tasks(4), read, l);
    expect(result).toMatchObject({ outcome: 'ok', sent: 3, failed: 1, total: 4 });
    expect(read).toHaveBeenCalledTimes(4);
    expect(l.warn).toHaveBeenCalledTimes(1);
  });

  it('два 405 подряд: цикл прерван, следующие карточки не запрашиваются', async () => {
    const read = reader(['ok', 405, 405, 'ok', 'ok']);
    const result = await runCycle(tasks(5), read, log());
    expect(result).toMatchObject({ outcome: 'blocked', status: 405, sent: 1, failed: 2 });
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('405, успех, 405: не блокировка', async () => {
    const read = reader([405, 'ok', 405, 'ok']);
    const result = await runCycle(tasks(4), read, log());
    expect(result).toMatchObject({ outcome: 'ok', sent: 2, failed: 2 });
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('429: цикл прерван сразу', async () => {
    const read = reader(['ok', 429, 'ok']);
    const result = await runCycle(tasks(3), read, log());
    expect(result).toMatchObject({ outcome: 'throttled', status: 429, sent: 1 });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('одна карточка и 405: suspect', async () => {
    const l = log();
    const result = await runCycle(tasks(1), reader([405]), l);
    expect(result).toMatchObject({ outcome: 'suspect', status: 405, sent: 0, failed: 1 });
    expect(l.warn).toHaveBeenCalledWith(expect.stringContaining('одна карточка'));
  });

  it('три одиночных 405 за цикл: blocked', async () => {
    const read = reader([405, 'ok', 405, 'ok', 405, 'ok', 'ok']);
    const result = await runCycle(tasks(7), read, log());
    expect(result).toMatchObject({ outcome: 'blocked', status: 405, sent: 2, failed: 3 });
    expect(read).toHaveBeenCalledTimes(5);
  });

  it('другие ошибки (404, сеть) карточку пропускают, цикл идёт дальше', async () => {
    const read = vi.fn(async (task: { masterSku: string }) => {
      if (task.masterSku === '1') throw httpError(404);
      if (task.masterSku === '2') throw new Error('fetch failed');
    });
    const result = await runCycle(tasks(3), read, log());
    expect(result).toMatchObject({ outcome: 'ok', sent: 1, failed: 2 });
  });

  it('диагностика из describe попадает в журнал', async () => {
    const l = log();
    await runCycle(tasks(2), reader([405, 'ok']), l, { describe: () => '405: server=nginx' });
    expect(l.warn).toHaveBeenCalledWith('диагностика 405: server=nginx (карточка 1)');
  });

  it('shouldStop останавливает цикл без ошибок', async () => {
    let stop = false;
    const read = vi.fn(async () => {
      stop = true;
    });
    const result = await runCycle(tasks(3), read, log(), { shouldStop: () => stop });
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('ok');
  });
});

describe('nextStreak', () => {
  const r = (partial: Partial<CycleResult>): CycleResult => ({ outcome: 'ok', sent: 0, failed: 0, total: 3, ...partial });

  it('растёт при blocked, throttled и suspect', () => {
    expect(nextStreak(0, r({ outcome: 'blocked' }))).toBe(1);
    expect(nextStreak(2, r({ outcome: 'throttled' }))).toBe(3);
    expect(nextStreak(4, r({ outcome: 'suspect' }))).toBe(5);
  });

  it('сбрасывается после успешного чтения или пустого списка задач', () => {
    expect(nextStreak(3, r({ sent: 2 }))).toBe(0);
    expect(nextStreak(3, r({ total: 0 }))).toBe(0);
  });

  it('цикл ok без единой прочитанной карточки счётчик не сбрасывает', () => {
    expect(nextStreak(3, r({ sent: 0, failed: 3 }))).toBe(3);
  });

  it('восстановление: blocked, затем успешный цикл', async () => {
    let streak = 0;
    streak = nextStreak(streak, await runCycle(tasks(3), reader([405, 405, 'ok']), log()));
    expect(streak).toBe(1);
    streak = nextStreak(streak, await runCycle(tasks(3), reader(['ok', 'ok', 'ok']), log()));
    expect(streak).toBe(0);
  });
});
