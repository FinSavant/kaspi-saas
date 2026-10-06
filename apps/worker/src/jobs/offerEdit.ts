import type { OfferEditJob } from '@kaspi/core';
import { prisma } from '@kaspi/db';
import type { StoreState } from '@kaspi/kaspi-client';
import { withCabinet } from '../kaspi';

/**
 * Правка товара из таблицы «Робот» — сразу в кабинете Kaspi. Склады берутся свежими
 * из кабинета (Kaspi уменьшает остатки при продажах), меняется только то, что правили.
 */
export async function editOffer(job: OfferEditJob): Promise<{ stores: StoreState[]; price: number }> {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: job.productId }, include: { shop: true } });
  const { shop } = product;

  return withCabinet(shop, async (client) => {
    const offer = await client.getOffer(shop.merchantId, product.kaspiSku);
    if (!offer) throw new Error('Товар не найден в кабинете Kaspi — синхронизируйте товары.');
    let stores = offer.stores;

    if (job.kind === 'price') {
      await client.updateOffer(shop.merchantId, product.kaspiSku, stores, { cityId: shop.cityId, value: job.value });
      await prisma.$transaction([
        prisma.product.update({ where: { id: product.id }, data: { price: job.value, stores: toJson(stores) } }),
        prisma.priceChange.create({ data: { productId: product.id, oldPrice: product.price, newPrice: job.value, reason: 'MANUAL' } }),
      ]);
      return { stores, price: job.value };
    }

    if (!stores.some((s) => s.storeId === job.storeId)) throw new Error('Склад не найден у этого товара.');
    stores = stores.map((s) => {
      if (s.storeId !== job.storeId) return s;
      // Остаток вписан вручную — предзаказ на этом складе больше не нужен
      if (job.kind === 'stock') return { ...s, stockCount: job.value, preOrder: null, available: s.available || (job.value ?? 0) > 0 };
      return { ...s, available: job.value };
    });
    await client.updateOffer(shop.merchantId, product.kaspiSku, stores);
    const stock = stores.filter((s) => s.available).reduce((sum, s) => sum + (s.stockCount ?? 0), 0);
    const preOrder = Math.max(0, ...stores.map((s) => s.preOrder ?? 0)) || null;
    await prisma.product.update({ where: { id: product.id }, data: { stores: toJson(stores), stock, preOrder, available: true } });
    return { stores, price: product.price };
  });
}

/** Склады — обычный JSON для поля Prisma Json. */
const toJson = (stores: StoreState[]) => JSON.parse(JSON.stringify(stores));
