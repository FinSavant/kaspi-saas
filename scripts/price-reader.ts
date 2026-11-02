// Читатель цен конкурентов для бота на сервере. Раз в минуту берёт с сервера карточки
// с включённым ботом, читает цены продавцов с витрины Kaspi и отправляет их на сервер.
// Решения о цене и смена цены — на сервере (COMPETITOR_SOURCE=remote).
// Запуск: start-price-reader.cmd (Windows) или systemd-служба sanq-price-reader (Ubuntu,
// см. deploy/price-reader/README.md). Остановка: закрыть окно / systemctl stop.
// В .env: SERVER_URL, SERVER_AUTH (логин:пароль кабинета на сервере), API_INTERNAL_KEY.
// Необязательно: STOREFRONT_MIN_INTERVAL_MS, BLOCKED_PAUSES_MIN (по умолчанию 5,10,20,40,60),
// BLOCKED_MAX_CYCLES (по умолчанию 6).
//
// Одиночный 405 на одной карточке пропускается. Если витрина закрыта (два 405 подряд, три за цикл,
// 405 на единственной карточке или любой 429), цикл прекращается сразу, остальные карточки не
// запрашиваются, пауза растёт; после долгой блокировки опрос останавливается с предупреждением
// (код выхода 78, systemd его не перезапускает). Правила цикла: price-reader-cycle.ts.

import { KaspiStorefrontError, KaspiStorefrontPriceSource } from '@kaspi/kaspi-client';
import { DEFAULT_BACKOFF, growingPause, onBlocked, parsePauses } from './price-reader-backoff';
import { nextStreak, runCycle } from './price-reader-cycle';

const serverUrl = process.env.SERVER_URL?.replace(/\/$/, '');
const serverAuth = process.env.SERVER_AUTH;
const apiKey = process.env.API_INTERNAL_KEY;

// Под journald уровень задаёт префикс <N>, а время ставит сам журнал
const underJournal = !!process.env.JOURNAL_STREAM;
const stamp = () => (underJournal ? '' : `${new Date().toLocaleTimeString('ru-RU')} `);
const info = (msg: string) => console.log(`${underJournal ? '<6>' : ''}${stamp()}${msg}`);
const warn = (msg: string) => console.warn(`${underJournal ? '<4>' : ''}${stamp()}${msg}`);
const fail = (msg: string) => console.error(`${underJournal ? '<3>' : ''}${stamp()}${msg}`);

if (!serverUrl || !serverAuth || !apiKey) {
  fail('В .env должны быть заданы SERVER_URL, SERVER_AUTH и API_INTERNAL_KEY');
  process.exit(1);
}

const CYCLE_MS = 60_000;
const SERVER_ERROR_CAP_MS = 15 * 60_000;
const EXIT_BLOCKED = 78;
const backoff = {
  pausesMin: parsePauses(process.env.BLOCKED_PAUSES_MIN) ?? DEFAULT_BACKOFF.pausesMin,
  maxBlockedCycles: Number(process.env.BLOCKED_MAX_CYCLES) > 0 ? Number(process.env.BLOCKED_MAX_CYCLES) : DEFAULT_BACKOFF.maxBlockedCycles,
};
const headers = {
  Authorization: `Basic ${Buffer.from(serverAuth).toString('base64')}`,
  'x-api-key': apiKey,
};
const storefront = new KaspiStorefrontPriceSource({ minIntervalMs: Number(process.env.STOREFRONT_MIN_INTERVAL_MS ?? 1_000) });

/** Строка для журнала: статус и безопасные поля ответа, без cookie и токенов. */
function describeStorefrontError(error: KaspiStorefrontError): string {
  const i = error.info;
  if (!i) return `${error.status}: нет данных об ответе`;
  return [
    `${error.status}:`,
    `url=${i.url || '-'}`,
    `redirected=${i.redirected}`,
    `server=${i.server ?? '-'}`,
    `allow=${i.allow ?? '-'}`,
    `content-type=${i.contentType ?? '-'}`,
    `location=${i.location ?? '-'}`,
    `тело="${i.snippet}"`,
  ].join(' ');
}

async function server<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${serverUrl}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`сервер ответил ${res.status}`);
  return res.json() as Promise<T>;
}

// Мягкая остановка по SIGTERM/SIGINT: допускаем текущую карточку и выходим без ошибок
let stopping = false;
let wake: (() => void) | undefined;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (!stopping) info(`Получен ${signal}, останавливаюсь`);
    stopping = true;
    wake?.();
  });
}
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      wake = undefined;
      resolve();
    }
    wake = done;
  });

info(`Читатель цен запущен, сервер ${serverUrl}.${underJournal ? '' : ' Окно не закрывайте.'}`);
let blockedStreak = 0;
let serverFailures = 0;

while (!stopping) {
  const started = Date.now();
  let pauseMs = CYCLE_MS;
  try {
    const tasks = await server<{ masterSku: string; cityId: string; repricer: boolean }[]>('/reader/tasks');
    serverFailures = 0;
    const result = await runCycle(
      tasks,
      async (task) => {
        const offers = await storefront.getOffers(task);
        await server('/reader/offers', { ...task, offers });
      },
      { warn },
      { shouldStop: () => stopping, describe: (e) => (e instanceof KaspiStorefrontError ? describeStorefrontError(e) : undefined) },
    );
    const previousStreak = blockedStreak;
    blockedStreak = nextStreak(previousStreak, result);
    if (result.outcome === 'ok') {
      if (result.sent > 0 && previousStreak > 0) info('Витрина Kaspi снова отвечает, возвращаюсь к обычному режиму');
      info(`карточек прочитано: ${result.sent}${result.failed ? `, ошибок: ${result.failed}` : ''}`);
      pauseMs = Math.max(5_000, CYCLE_MS - (Date.now() - started));
    } else {
      const decision = onBlocked(blockedStreak, backoff);
      if (decision.action === 'stop') {
        fail(
          `Kaspi отвечает ${result.status} уже ${decision.streak} циклов подряд. Опрос остановлен, чтобы не нагружать витрину. ` +
            `Цены конкурентов не обновляются, робот цен их не получает. Проверьте доступ и запустите службу вручную: systemctl start sanq-price-reader.`,
        );
        process.exit(EXIT_BLOCKED);
      }
      pauseMs = decision.pauseMs;
      const reason =
        result.outcome === 'throttled'
          ? 'просит реже (429)'
          : result.outcome === 'suspect'
            ? 'ответил 405 на единственную карточку, это не подтверждает блокировку, но пауза включена'
            : `ответил ${result.status} на нескольких карточках, витрина закрыта для этого адреса`;
      warn(
        `Kaspi ${reason}. Цикл прерван, остальные карточки не запрашиваются. ` +
          `Пауза ${Math.round(pauseMs / 60_000)} мин. Подряд: ${decision.streak} из ${backoff.maxBlockedCycles}.`,
      );
    }
  } catch (error) {
    serverFailures++;
    pauseMs = growingPause(serverFailures, CYCLE_MS, SERVER_ERROR_CAP_MS);
    fail(`нет связи с сервером: ${error instanceof Error ? error.message : error}. Повтор через ${Math.round(pauseMs / 1000)} с`);
  }
  if (!stopping) await sleep(pauseMs);
}
info('Читатель цен остановлен');
