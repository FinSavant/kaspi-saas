import { decryptSecret } from '@kaspi/core';
import { prisma } from '@kaspi/db';
import { WbApiError, WbClient } from '@kaspi/kaspi-client';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Первая загрузка — за этот срок; дальше — последние недели: WB пересчитывает отчёт задним числом. */
const FIRST_SYNC_DAYS = 90;
const RESYNC_DAYS = 21;
/** WB разрешает отчёт о реализации раз в минуту — между страницами ждём. */
const PAGE_PAUSE_MS = 61_000;
/** Строк в одном ответе; меньше — значит, это последняя страница и лишний запрос не нужен. */
const PAGE_LIMIT = 100_000;

export interface WbSyncResult {
  rows: number;
  products: number;
  error?: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

function encryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required');
  return key;
}

function groupBy<T extends { realizationreportId: bigint | null }>(rows: T[]): Map<bigint, T[]> {
  const map = new Map<bigint, T[]>();
  for (const r of rows) if (r.realizationreportId) map.set(r.realizationreportId, [...(map.get(r.realizationreportId) ?? []), r]);
  return map;
}

/** Лимит частоты WB: короткую паузу (до 2 минут) выжидаем, длинную — нет, загрузка повторится по расписанию. */
async function withRetry<T>(call: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await call();
    } catch (error) {
      if (!(error instanceof WbApiError) || error.status !== 429 || i >= attempts || (error.retryAfterSec ?? 60) > 120) throw error;
      await new Promise((resolve) => setTimeout(resolve, (error.retryAfterSec ?? 60) * 1000 + 1000));
    }
  }
}

/** Загружает «Отчёт о реализации» WB в базу; товары появляются по артикулам WB из отчёта. */
export async function syncWb(accountId: string, now = new Date()): Promise<WbSyncResult> {
  const account = await prisma.wbAccount.findUniqueOrThrow({ where: { id: accountId } });
  const client = new WbClient(decryptSecret(account.tokenEnc, encryptionKey()));
  const from = new Date(now.getTime() - (account.syncedAt ? RESYNC_DAYS : FIRST_SYNC_DAYS) * DAY_MS);
  const result: WbSyncResult = { rows: 0, products: 0 };

  try {
    for (let rrdid = 0n, page = 0; ; page++) {
      if (page > 0) await new Promise((resolve) => setTimeout(resolve, PAGE_PAUSE_MS));
      const rows = await withRetry(() => client.realizationPage(ymd(from), ymd(now), rrdid, PAGE_LIMIT));
      if (rows.length === 0) break;
      // Отчёт, загруженный файлом, главнее: его строки из API не добавляем
      const fromFiles = new Set(
        (await prisma.wbReport.findMany({ where: { accountId, source: 'file' }, select: { reportId: true } })).map((r) => r.reportId),
      );
      const fresh = rows.filter((r) => !(r.realizationreportId && fromFiles.has(r.realizationreportId)));
      await prisma.wbReportRow.createMany({
        data: fresh.map(({ reportDateFrom: _from, reportDateTo: _to, ...r }) => ({ accountId, ...r, title: r.subject })),
        skipDuplicates: true,
      });
      for (const [reportId, list] of groupBy(fresh)) {
        const count = await prisma.wbReportRow.count({ where: { accountId, realizationreportId: reportId } });
        await prisma.wbReport.upsert({
          where: { accountId_reportId: { accountId, reportId } },
          create: { accountId, reportId, source: 'api', dateFrom: list[0]!.reportDateFrom, dateTo: list[0]!.reportDateTo, rowsCount: count },
          update: { rowsCount: count, ...(list[0]!.reportDateFrom && { dateFrom: list[0]!.reportDateFrom, dateTo: list[0]!.reportDateTo }) },
        });
      }
      result.rows += fresh.length;

      const products = new Map<bigint, { saName: string | null; title: string | null }>();
      for (const r of rows) if (r.nmId) products.set(r.nmId, { saName: r.saName, title: r.subject });
      for (const [nmId, p] of products) {
        await prisma.wbProduct.upsert({
          where: { accountId_nmId: { accountId, nmId } },
          create: { accountId, nmId, ...p },
          update: { ...(p.saName && { saName: p.saName }), ...(p.title && { title: p.title }) },
        });
      }
      result.products += products.size;
      // Базовому токену WB даёт 2 запроса в сутки — не тратим запрос на пустую страницу
      if (rows.length < PAGE_LIMIT) break;
      rrdid = rows[rows.length - 1]!.rrdId;
    }
    await prisma.wbAccount.update({ where: { id: accountId }, data: { syncedAt: now, syncError: null } });
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error);
    // Базовому токену WB даёт 2 запроса к финансовым отчётам в сутки — подсказываем, когда будет следующий
    if (error instanceof WbApiError && error.status === 429 && (error.retryAfterSec ?? 0) > 120) {
      const next = new Date(Date.now() + error.retryAfterSec! * 1000).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'short', timeStyle: 'short' });
      message = `WB разрешает этому токену загрузку раз в 12 часов — следующая после ${next}. Чтобы обновлять чаще, создайте персональный токен (см. «Заменить токен WB»).`;
    }
    await prisma.wbAccount.update({ where: { id: accountId }, data: { syncError: message.slice(0, 300) } });
    result.error = message;
  }
  return result;
}
