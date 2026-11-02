// Один цикл читателя цен: как реагировать на 405/429 витрины Kaspi.
// Чистая логика без сети и таймеров, чтобы её можно было проверить тестами.
//
// Одиночный 405 на одной карточке блокировкой не считается: карточка пропускается, цикл идёт дальше.
// Блокировка: два 405 подряд, три 405 за цикл или любой 429. Тогда цикл прерывается,
// остальные карточки не запрашиваются, а вызывающий код включает паузу (onBlocked).

export type CycleOutcome = 'ok' | 'blocked' | 'throttled' | 'suspect';

export interface CycleResult {
  outcome: CycleOutcome;
  sent: number;
  failed: number;
  /** Сколько карточек было в цикле. */
  total: number;
  /** HTTP-статус витрины, из-за которого цикл не 'ok'. */
  status?: number;
}

export interface CycleOptions {
  /** Мягкая остановка по SIGTERM/SIGINT: текущую карточку дочитываем и выходим. */
  shouldStop?: () => boolean;
  /** Строка для журнала про ответ витрины (заголовки, начало тела), если ошибка её даёт. */
  describe?: (error: unknown) => string | undefined;
}

/** Подряд идущие 405 на разных карточках, после которых считаем витрину закрытой. */
export const CONSECUTIVE_405_LIMIT = 2;
/** Столько 405 за один цикл (даже вперемешку с успехами) тоже считаем блокировкой. */
export const CYCLE_405_LIMIT = 3;

const statusOf = (error: unknown): number | undefined => {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
};

export async function runCycle<T extends { masterSku: string }>(
  tasks: T[],
  readAndSend: (task: T) => Promise<void>,
  log: { warn: (message: string) => void },
  options: CycleOptions = {},
): Promise<CycleResult> {
  let sent = 0;
  let failed = 0;
  let consecutive405 = 0;
  let total405 = 0;
  const result = (outcome: CycleOutcome, status?: number): CycleResult => ({ outcome, sent, failed, total: tasks.length, status });

  for (const task of tasks) {
    if (options.shouldStop?.()) break;
    try {
      await readAndSend(task);
      sent++;
      consecutive405 = 0;
    } catch (error) {
      const status = statusOf(error);
      if (status === 429) {
        failed++;
        log.warn(`диагностика ${options.describe?.(error) ?? '429'} (карточка ${task.masterSku})`);
        return result('throttled', 429);
      }
      failed++;
      if (status === 405) {
        consecutive405++;
        total405++;
        log.warn(`диагностика ${options.describe?.(error) ?? '405'} (карточка ${task.masterSku})`);
        if (consecutive405 >= CONSECUTIVE_405_LIMIT || total405 >= CYCLE_405_LIMIT) return result('blocked', 405);
        if (tasks.length === 1) {
          log.warn('в цикле одна карточка, 405 не подтверждает блокировку');
          return result('suspect', 405);
        }
        continue;
      }
      log.warn(`карточка ${task.masterSku}: ${error instanceof Error ? error.message : error}`);
    }
  }
  return result('ok');
}

/**
 * Сколько циклов подряд витрина закрыта, включая этот.
 * Растёт на blocked/throttled/suspect; сбрасывается только успешным чтением (или пустым списком задач).
 * Цикл без блокировки, но и без единого прочитанного (например, одни 404), счётчик не трогает.
 */
export function nextStreak(previous: number, result: CycleResult): number {
  if (result.outcome !== 'ok') return previous + 1;
  return result.sent > 0 || result.total === 0 ? 0 : previous;
}
