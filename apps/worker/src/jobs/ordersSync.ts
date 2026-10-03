import { NOT_SOLD_STATUSES } from '@kaspi/core';
import { prisma } from '@kaspi/db';
import type { KaspiOrder } from '@kaspi/kaspi-client';
import { kaspiClientForShop } from '../kaspi';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Глубина первой загрузки — на ней строится аналитика за год. */
const INITIAL_DAYS = 366;
/** При обновлении перечитываем последние две недели: статусы заказов ещё меняются. */
const REFRESH_DAYS = 14;
const STATES = ['NEW', 'SIGN_REQUIRED', 'PICKUP', 'DELIVERY', 'KASPI_DELIVERY', 'ARCHIVE'];
const ENTRIES_CONCURRENCY = 4;

export interface OrdersSyncResult {
  orders: number;
  itemsLoaded: number;
  itemsFailed: number;
}

/**
 * Загружает заказы магазина и их позиции для аналитики. Первый раз (или с
 * `full`) — за год, дальше — с запасом в две недели от прошлой загрузки.
 */
export async function syncOrders(shopId: string, options: { full?: boolean } = {}): Promise<OrdersSyncResult> {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
  const client = kaspiClientForShop(shop);
  const startedAt = new Date();
  let from = shop.ordersSyncedAt && !options.full
    ? new Date(shop.ordersSyncedAt.getTime() - REFRESH_DAYS * DAY_MS)
    : new Date(startedAt.getTime() - INITIAL_DAYS * DAY_MS);

  // Заказы, которые ещё в пути, перечитываем, даже если они старше окна:
  // иначе выданный или отменённый заказ навсегда остался бы «в доставке»
  const oldestOpen = await prisma.order.findFirst({
    where: { shopId, status: { notIn: ['COMPLETED', ...NOT_SOLD_STATUSES] } },
    orderBy: { createdAtKaspi: 'asc' },
    select: { createdAtKaspi: true },
  });
  if (oldestOpen && oldestOpen.createdAtKaspi < from) {
    const limit = new Date(startedAt.getTime() - INITIAL_DAYS * DAY_MS);
    from = oldestOpen.createdAtKaspi > limit ? oldestOpen.createdAtKaspi : limit;
  }

  const orders: KaspiOrder[] = [];
  for (const state of STATES) orders.push(...(await client.listOrders({ state, from, to: startedAt })));

  for (const order of orders) {
    const data = {
      kaspiOrderId: order.id,
      state: order.state,
      status: order.status,
      totalPrice: order.totalPrice,
      deliveryCost: order.deliveryCostForSeller,
      city: order.city,
      waybillUrl: order.waybillUrl,
      createdAtKaspi: order.createdAt,
      completedAt: order.completedAt,
      courierTransmissionDate: order.courierTransmissionDate,
      deliveryMode: order.deliveryMode,
      paymentMode: order.paymentMode,
      isKaspiDelivery: order.isKaspiDelivery,
      express: order.express,
      syncedAt: startedAt,
    };
    await prisma.order.upsert({
      where: { shopId_code: { shopId, code: order.code } },
      create: { shopId, code: order.code, ...data },
      update: data,
    });
  }

  // Позиции нужны только проданным заказам; у отменённых их не загружаем
  const pending = await prisma.order.findMany({
    where: { shopId, itemsSyncedAt: null, status: { notIn: [...NOT_SOLD_STATUSES] } },
    select: { id: true, kaspiOrderId: true },
  });
  const products = await prisma.product.findMany({ where: { shopId }, select: { id: true, kaspiSku: true } });
  const productBySku = new Map(products.map((p) => [p.kaspiSku, p.id]));

  let itemsLoaded = 0;
  let itemsFailed = 0;
  let next = 0;
  const runners = Array.from({ length: Math.min(ENTRIES_CONCURRENCY, pending.length) }, async () => {
    while (next < pending.length) {
      const order = pending[next++]!;
      try {
        const entries = await client.getOrderEntries(order.kaspiOrderId);
        await prisma.$transaction([
          prisma.orderItem.deleteMany({ where: { orderId: order.id } }),
          prisma.orderItem.createMany({
            data: entries.map((e) => ({
              orderId: order.id,
              productId: productBySku.get(e.sku) ?? null,
              kaspiSku: e.sku,
              name: e.name,
              category: e.categoryCode,
              categoryTitle: e.categoryTitle,
              quantity: e.quantity,
              unitPrice: e.basePrice,
              totalPrice: e.totalPrice,
            })),
          }),
          prisma.order.update({ where: { id: order.id }, data: { itemsSyncedAt: new Date() } }),
        ]);
        itemsLoaded++;
      } catch (error) {
        // Заказ останется без позиций и загрузится при следующей синхронизации
        itemsFailed++;
        console.warn(`[orders-sync] entries for order ${order.kaspiOrderId} failed:`, error);
      }
    }
  });
  await Promise.all(runners);

  // Товары, синхронизированные после продажи, привязываем к старым позициям
  for (const [sku, productId] of productBySku) {
    await prisma.orderItem.updateMany({
      where: { kaspiSku: sku, productId: null, order: { shopId } },
      data: { productId },
    });
  }

  await prisma.shop.update({ where: { id: shopId }, data: { ordersSyncedAt: startedAt } });
  return { orders: orders.length, itemsLoaded, itemsFailed };
}
