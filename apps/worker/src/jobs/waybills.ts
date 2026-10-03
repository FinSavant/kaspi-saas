import { mergeWaybills, selectWaybillOrders, type WaybillLayout, type WaybillsJob } from '@kaspi/core';
import { prisma, type WaybillLayout as DbWaybillLayout } from '@kaspi/db';
import { isAwaitingHandover, type KaspiClient, type KaspiOrder } from '@kaspi/kaspi-client';
import type { FileStorage } from '@kaspi/storage';
import { kaspiClientForShop } from '../kaspi';
import { sendTelegramDocument, sendTelegramMessage } from '../telegram';

const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const DOWNLOAD_CONCURRENCY = 5;

export interface PrintResult {
  count: number;
  /** Заказы, накладные которых Kaspi ещё не отдаёт. */
  notReady: number;
  /** Скачанные файлы, которые не удалось прочитать как PDF. */
  unreadable: number;
  /** Пакет с готовым PDF; нет, если склеивать было нечего. */
  batchId?: string;
}

const DB_LAYOUT: Record<WaybillLayout, DbWaybillLayout> = {
  thermal: 'THERMAL',
  a4x4: 'A4_X4',
  a4x8: 'A4_X8',
};

/** Склеивает накладные заказов из вкладки «Передача», которые ещё не печатались, и помечает их напечатанными. */
export async function printWaybills(job: WaybillsJob, storage: FileStorage): Promise<PrintResult> {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: job.shopId } });
  const client = kaspiClientForShop(shop);

  const deliveryOrders = await client.listOrders({
    state: 'KASPI_DELIVERY',
    from: new Date(Date.now() - LOOKBACK_MS),
  });
  let fresh: typeof deliveryOrders;
  let printedCodes = new Set<string>();

  if (job.reprintBatchId) {
    // Пересборка: те же заказы, что в прежнем пакете, пока Kaspi отдаёт их накладные
    const source = await prisma.waybillBatch.findFirstOrThrow({
      where: { id: job.reprintBatchId, shopId: shop.id },
      include: { waybills: { select: { orderCode: true } } },
    });
    const codes = new Set(source.waybills.map((w) => w.orderCode));
    fresh = deliveryOrders.filter((o) => codes.has(o.code) && o.waybillUrl);
  } else {
    // Только вкладка «Передача»: «Упаковка» и уже переданные курьеру не трогаем
    const orders = deliveryOrders.filter(isAwaitingHandover);
    const alreadyPrinted = await prisma.printedWaybill.findMany({
      where: { shopId: shop.id, orderCode: { in: orders.map((o) => o.code) } },
      select: { orderCode: true },
    });
    printedCodes = new Set(alreadyPrinted.map((p) => p.orderCode));
    // «Только новые заказы» включено по умолчанию: напечатанные повторно не попадают
    const candidates = job.onlyNew === false ? orders : orders.filter((o) => !printedCodes.has(o.code));
    fresh = await applyPrintFilters(candidates, job, client);
  }

  if (fresh.length === 0) {
    if (job.telegramChatId) {
      await sendTelegramMessage(job.telegramChatId, `${shop.name}: подходящих заказов в «Передаче» нет.`);
    }
    return { count: 0, notReady: 0, unreadable: 0 };
  }

  // Kaspi формирует накладные с задержкой: недоступные сейчас пропускаем,
  // они не помечаются напечатанными и попадут в следующую печать
  const downloads = await mapWithLimit(fresh, DOWNLOAD_CONCURRENCY, (o) => client.downloadWaybill(o.waybillUrl!));
  const downloaded = fresh.flatMap((order, index) => {
    const result = downloads[index]!;
    return result.status === 'fulfilled' ? [{ order, file: result.value }] : [];
  });
  const notReady = fresh.length - downloaded.length;
  if (downloaded.length === 0) {
    if (job.telegramChatId) {
      await sendTelegramMessage(job.telegramChatId, `${shop.name}: Kaspi ещё не сформировал накладные (${notReady}). Повторите позже.`);
    }
    return { count: 0, notReady, unreadable: 0 };
  }

  const merged = await mergeWaybills(downloaded.map((d) => d.file), job.layout);
  const unreadableIndexes = new Set(merged.failedIndexes);
  const mergedOrders = downloaded.filter((_, index) => !unreadableIndexes.has(index)).map((d) => d.order);
  if (mergedOrders.length === 0) throw new Error('None of the downloaded waybills could be read as PDF');

  const storagePath = `waybills/${shop.id}/${Date.now()}.pdf`;
  await storage.save(storagePath, merged.pdf, 'application/pdf');

  // Нечитаемые накладные не помечаются напечатанными и попадут в следующую печать.
  // При пересборке и при повторной печати отметки уже стоят, новые не создаются
  const newlyPrinted = job.reprintBatchId ? [] : mergedOrders.filter((o) => !printedCodes.has(o.code));
  const batch = await prisma.waybillBatch.create({
    data: {
      shopId: shop.id,
      layout: DB_LAYOUT[job.layout],
      storagePath,
      count: mergedOrders.length,
      waybills: { create: newlyPrinted.map((o) => ({ shopId: shop.id, orderCode: o.code })) },
    },
  });

  const unreadable = unreadableIndexes.size;
  if (job.telegramChatId) {
    const notes = [
      notReady > 0 ? `Ещё не сформированы в Kaspi: ${notReady}.` : '',
      unreadable > 0 ? `Не удалось прочитать: ${unreadable}.` : '',
    ].join(' ');
    await sendTelegramDocument(
      job.telegramChatId,
      merged.pdf,
      `waybills-${mergedOrders.length}.pdf`,
      `${shop.name}: накладных в файле — ${mergedOrders.length}. ${notes}`.trim(),
    );
  }
  return { count: mergedOrders.length, notReady, unreadable, batchId: batch.id };
}

/**
 * Фильтры и сортировка печати. Товары заказа нужны только для сортировки и
 * фильтра по товарам — тогда они запрашиваются у Kaspi по каждому заказу.
 */
async function applyPrintFilters(orders: KaspiOrder[], job: WaybillsJob, client: KaspiClient): Promise<KaspiOrder[]> {
  const needItems = (job.sort && job.sort !== 'none') || (job.skus?.length ?? 0) > 0;
  const entries = needItems
    ? await mapWithLimit(orders, DOWNLOAD_CONCURRENCY, (o) => client.getOrderEntries(o.id))
    : [];
  const candidates = orders.map((order, index) => {
    const result = entries[index];
    const items = result?.status === 'fulfilled' ? result.value.map((e) => ({ sku: e.sku, name: e.name })) : [];
    return { order, code: order.code, city: order.city, express: order.express, createdAt: order.createdAt, items };
  });
  return selectWaybillOrders(candidates, job).map((c) => c.order);
}

/** Как Promise.allSettled, но не больше `limit` задач одновременно. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index]!) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(runners);
  return results;
}
