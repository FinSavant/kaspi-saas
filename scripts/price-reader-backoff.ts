// Паузы читателя цен при блокировке витрины Kaspi (HTTP 405) и других сбоях.
// Чистая логика без сети и таймеров, чтобы её можно было проверить тестами.

export interface BackoffOptions {
  /** Паузы по порядку подряд идущих блокировок, минуты. Последняя — потолок. */
  pausesMin: number[];
  /** После стольких подряд заблокированных циклов опрос останавливается. */
  maxBlockedCycles: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { pausesMin: [5, 10, 20, 40, 60], maxBlockedCycles: 6 };

export type BlockDecision = { action: 'pause'; pauseMs: number; streak: number } | { action: 'stop'; streak: number };

/** streak — сколько циклов подряд витрина ответила 405, включая текущий (с 1). */
export function onBlocked(streak: number, options: BackoffOptions = DEFAULT_BACKOFF): BlockDecision {
  if (streak >= options.maxBlockedCycles) return { action: 'stop', streak };
  const pauses = options.pausesMin.length ? options.pausesMin : DEFAULT_BACKOFF.pausesMin;
  const minutes = pauses[Math.min(streak, pauses.length) - 1] ?? pauses[pauses.length - 1]!;
  return { action: 'pause', pauseMs: minutes * 60_000, streak };
}

/** Пауза при сбоях связи или 429/5xx: удваивается от базы до потолка. */
export function growingPause(failures: number, baseMs: number, capMs: number): number {
  return Math.min(capMs, baseMs * 2 ** Math.max(0, failures - 1));
}

/** "5,10,20" → [5,10,20]; мусор и неположительные значения отбрасываются. */
export function parsePauses(raw: string | undefined): number[] | null {
  if (!raw) return null;
  const list = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
  return list.length ? list : null;
}
