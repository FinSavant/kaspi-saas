import { prisma } from '@kaspi/db';
import { withCabinet } from '../kaspi';

export interface PreorderResult {
  checked: number;
  /** Товары, поставленные на предзаказ (закончились или сменили число дней). */
  updated: string[];
  failed: number;
}

/**
 * Автопредзаказ: товары, у которых задано число дней, ставятся на предзаказ, как
 * только закончились (нет в «В продаже» или остаток 0). Состояние берётся свежим из
 * кабинета одним списком товаров, поэтому задача дешёвая и идёт раз в несколько минут.
 */
export async function applyPreorders(shopId: string): Promise<PreorderResult> {
  const products = await prisma.product.findMany({
    where: { shopId, preorderDays: { gt: 0 } },
    select: { id: true, kaspiSku: true, preorderDays: true },
  });
  const result: PreorderResult = { checked: products.length, updated: [], failed: 0 };
  if (products.length === 0) return result;

  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
  await withCabinet(shop, async (client) => {
    const onSale = new Map((await client.listActiveOffers(shop.merchantId)).map((o) => [o.sku, o]));
    for (const product of products) {
      const offer = onSale.get(product.kaspiSku);
      const days = product.preorderDays!;
      // Остаток без учёта (null) — товар в наличии; на предзаказе Kaspi тоже не отдаёт остаток
      const soldOut = !offer || (offer.stock === 0 && !offer.preOrder);
      // Смену дней у товара, уже стоящего на предзаказе, Kaspi пока не принимает (проверено
      // 05.10.2026) — такие товары не трогаем, чтобы не отправлять одно и то же каждые 5 минут
      if (!soldOut) {
        if (offer) await prisma.product.update({ where: { id: product.id }, data: { preOrder: offer.preOrder } });
        continue;
      }
      try {
        await client.setPreOrder(shop.merchantId, product.kaspiSku, days);
        await prisma.product.update({ where: { id: product.id }, data: { preOrder: days, available: true } });
        result.updated.push(product.kaspiSku);
      } catch (error) {
        result.failed++;
        console.warn(`[preorder] ${product.kaspiSku} failed:`, error instanceof Error ? error.message : error);
      }
    }
  });
  return result;
}
