import { prisma } from '@kaspi/db';
import type { KaspiStorefrontPriceSource } from '@kaspi/kaspi-client';
import { withCabinet } from '../kaspi';

export interface SyncResult {
  /** Товаров во вкладке «В продаже». */
  onSale: number;
  created: number;
  updated: number;
  /** Товары, которые были в продаже, а теперь сняты. */
  removedFromSale: number;
  /** Карточки, по которым удалось посчитать продавцов. */
  sellersChecked: number;
}

/**
 * Синхронизирует товары магазина с вкладкой «В продаже» кабинета Kaspi:
 * артикул, номер карточки, название, цена, остатки. Затем, если передан
 * источник цен витрины, считает продавцов в каждой карточке.
 */
export async function syncProducts(
  shopId: string,
  storefront: KaspiStorefrontPriceSource | null,
): Promise<SyncResult> {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
  const offers = await withCabinet(shop, (client) => client.listActiveOffers(shop.merchantId));

  const result: SyncResult = { onSale: offers.length, created: 0, updated: 0, removedFromSale: 0, sellersChecked: 0 };
  const settings = await prisma.repricerSetting.findMany({
    where: { product: { shopId }, enabled: true },
    select: { product: { select: { kaspiSku: true } } },
  });
  const repricedSkus = new Set(settings.map((s) => s.product.kaspiSku));

  for (const offer of offers) {
    const price = offer.cityPrices[shop.cityId] ?? offer.minPrice;
    const details = {
      kaspiMasterSku: offer.masterSku,
      name: offer.name,
      brand: offer.brand,
      category: offer.category,
      stock: offer.stock ?? 0,
      available: true,
      preOrder: offer.preOrder,
    };
    const where = { shopId_kaspiSku: { shopId, kaspiSku: offer.sku } };
    const existing = await prisma.product.findUnique({ where, select: { id: true } });

    // Цену товара с включённым ботом не перезаписываем: её ведёт бот,
    // а Kaspi мог ещё не забрать новый прайс-лист
    const priceUpdate = price && !repricedSkus.has(offer.sku) ? { price } : {};
    await prisma.product.upsert({
      where,
      create: { shopId, kaspiSku: offer.sku, price: price ?? 0, ...details },
      update: { ...details, ...priceUpdate },
    });
    if (existing) result.updated++;
    else result.created++;
  }

  const removed = await prisma.product.updateMany({
    where: { shopId, available: true, kaspiSku: { notIn: offers.map((o) => o.sku) } },
    data: { available: false, preOrder: null },
  });
  result.removedFromSale = removed.count;

  if (storefront) {
    for (const offer of offers) {
      if (!offer.masterSku) continue;
      try {
        const sellers = await storefront.getOffers({ masterSku: offer.masterSku, cityId: shop.cityId });
        await prisma.product.update({
          where: { shopId_kaspiSku: { shopId, kaspiSku: offer.sku } },
          data: { sellersCount: sellers.length },
        });
        result.sellersChecked++;
      } catch (error) {
        console.warn(`[products-sync] sellers count for ${offer.masterSku} failed:`, error);
      }
    }
  }

  await prisma.shop.update({ where: { id: shopId }, data: { productsSyncedAt: new Date() } });
  return result;
}
