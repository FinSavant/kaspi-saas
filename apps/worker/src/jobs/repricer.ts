import {
  calculatePrice,
  OffersNotReadyError,
  type CompetitorOffer,
  type CompetitorPriceSource,
  type RepricerJob,
} from '@kaspi/core';
import { prisma } from '@kaspi/db';
import { KaspiCabinetOutOfStockError, KaspiCabinetRateLimitError } from '@kaspi/kaspi-client';
import type { Queue } from 'bullmq';
import { withCabinet } from '../kaspi';

/**
 * Ставит в очередь товары, у которых истёк интервал проверки. Берутся только
 * товары, где бот включён вручную, и только магазины без общей паузы.
 */
export async function enqueueDueProducts(queue: Queue<RepricerJob>): Promise<number> {
  const now = Date.now();
  const settings = await prisma.repricerSetting.findMany({
    where: { enabled: true, product: { shop: { repricerEnabled: true } } },
    select: { productId: true, lastCheckedAt: true, checkIntervalSec: true },
  });
  const due = settings.filter(
    (s) => !s.lastCheckedAt || s.lastCheckedAt.getTime() + s.checkIntervalSec * 1000 <= now,
  );

  await queue.addBulk(
    due.map((s) => ({
      name: 'reprice',
      data: { productId: s.productId },
      // Один и тот же товар не попадает в очередь дважды, пока задача не выполнена
      opts: { jobId: `reprice-${s.productId}`, removeOnComplete: true, removeOnFail: true },
    })),
  );
  return due.length;
}

/** Как долго считать отправленную в Kaspi цену «применяется» и не отправлять её повторно. */
const PENDING_PRICE_MS = 30 * 60 * 1000;
/** Пауза для товара, если Kaspi сообщил об исчерпании лимита изменений цены. */
const RATE_LIMIT_BACKOFF_MS = 30 * 60 * 1000;

export interface RepricerOptions {
  /** Отправлять новую цену в кабинет Kaspi. Без этого цена меняется только в базе. */
  publish: boolean;
}

export async function repriceProduct(
  productId: string,
  source: CompetitorPriceSource,
  options: RepricerOptions,
): Promise<void> {
  const setting = await prisma.repricerSetting.findUnique({
    where: { productId },
    include: { product: { include: { shop: true } } },
  });
  if (!setting?.enabled || !setting.product.shop.repricerEnabled) return;

  const { product } = setting;
  if (!product.kaspiMasterSku) {
    // Без кода карточки цены конкурентов получить нельзя; отметка времени
    // не даёт товару попадать в очередь на каждом тике
    await prisma.repricerSetting.update({ where: { productId }, data: { lastCheckedAt: new Date() } });
    console.warn(`[repricer] product ${productId} has no kaspiMasterSku, skipped`);
    return;
  }

  const { shop } = product;
  let offers: CompetitorOffer[];
  try {
    offers = await source.getOffers({ masterSku: product.kaspiMasterSku, cityId: shop.cityId });
  } catch (error) {
    if (!(error instanceof OffersNotReadyError)) throw error;
    // Читатель цен на компьютере выключен — ждём следующего интервала без решения
    await prisma.repricerSetting.update({ where: { productId }, data: { lastCheckedAt: new Date() } });
    return;
  }
  const competitors = offers.filter((o) => o.merchantId !== shop.merchantId).sort((a, b) => a.price - b.price);
  // Цена в карточке Kaspi важнее цены в базе: её могли поменять вручную в кабинете
  const livePrice = offers.find((o) => o.merchantId === shop.merchantId)?.price ?? product.price;

  const decision = calculatePrice({
    currentPrice: livePrice,
    floorPrice: setting.floorPrice,
    ceilingPrice: setting.ceilingPrice,
    step: setting.step,
    competitorPrices: competitors.map((o) => o.price),
  });

  await prisma.$transaction([
    prisma.competitorLog.createMany({
      data: competitors.map((o, index) => ({
        productId,
        merchantId: o.merchantId,
        merchantName: o.merchantName,
        price: o.price,
        position: index + 1,
      })),
    }),
    prisma.repricerSetting.update({ where: { productId }, data: { lastCheckedAt: new Date() } }),
    prisma.product.update({ where: { id: productId }, data: { sellersCount: offers.length } }),
  ]);

  if (!decision.changed) {
    if (livePrice !== product.price && !(await isPending(productId, product.price))) {
      await prisma.product.update({ where: { id: productId }, data: { price: livePrice } });
    }
    return;
  }
  // Kaspi показывает новую цену в карточке не сразу; ту же цену повторно не отправляем,
  // чтобы не тратить лимит изменений
  if (product.price === decision.price && (await isPending(productId, decision.price))) return;

  if (options.publish) {
    try {
      // Товар на предзаказе остаётся на предзаказе после смены цены
      await withCabinet(shop, (client) =>
        client.updatePrice(shop.merchantId, product.kaspiSku, shop.cityId, decision.price, product.preOrder),
      );
    } catch (error) {
      if (error instanceof KaspiCabinetOutOfStockError) {
        // Закончился: не трогаем, чтобы Kaspi снял его с продажи; бот вернётся к нему после поставки
        console.warn(`[repricer] product ${productId} is out of stock, price not changed`);
        await prisma.product.update({ where: { id: productId }, data: { stock: 0 } });
        return;
      }
      if (!(error instanceof KaspiCabinetRateLimitError)) throw error;
      console.warn(`[repricer] price change limit reached for shop ${shop.id}; product ${productId} postponed`);
      await prisma.repricerSetting.update({
        where: { productId },
        data: { lastCheckedAt: new Date(Date.now() + RATE_LIMIT_BACKOFF_MS) },
      });
      return;
    }
  }

  await prisma.$transaction([
    prisma.product.update({ where: { id: productId }, data: { price: decision.price } }),
    prisma.priceChange.create({
      data: {
        productId,
        oldPrice: livePrice,
        newPrice: decision.price,
        reason: options.publish ? decision.reason : `${decision.reason} (только в базе)`,
      },
    }),
  ]);
}

async function isPending(productId: string, price: number): Promise<boolean> {
  const last = await prisma.priceChange.findFirst({ where: { productId }, orderBy: { createdAt: 'desc' } });
  return !!last && last.newPrice === price && Date.now() - last.createdAt.getTime() < PENDING_PRICE_MS;
}
