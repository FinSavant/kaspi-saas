import { prisma } from '@kaspi/db';
import { isRestockedOnPreOrder } from '@kaspi/kaspi-client';
import { withCabinet } from '../kaspi';

export interface PreorderResult {
  /** Поставлены на предзаказ (или сменили дни): дни предзаказа заданы. */
  set: string[];
  /** Сняты с предзаказа: дни очищены или пришла поставка к предзаказу, поставленному в Kaspi вручную. */
  removed: string[];
  failed: number;
}

/** Повтор той же отправки не чаще раза в час: Kaspi применяет изменения минут через 10–15. */
const RETRY_MS = 60 * 60 * 1000;
const lastSent = new Map<string, { days: number | null; at: number }>();

function recentlySent(key: string, days: number | null): boolean {
  const sent = lastSent.get(key);
  return !!sent && sent.days === days && Date.now() - sent.at < RETRY_MS;
}

/**
 * Предзаказ магазина по свежему списку товаров кабинета (один запрос на магазин):
 * - у товара заданы дни — он на предзаказе на эти дни, сколько бы его ни было
 *   (остатки остаются настоящими, закончившимся складам ставится 999);
 * - дней нет, а товар на предзаказе с настоящим остатком (дни очистили или предзаказ
 *   поставили в Kaspi вручную и пришла поставка) — снимаем предзаказ.
 */
export async function applyPreorders(shopId: string): Promise<PreorderResult> {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
  const products = await prisma.product.findMany({ where: { shopId }, select: { id: true, kaspiSku: true, preorderDays: true } });
  const days = new Map(products.map((p) => [p.kaspiSku, p.preorderDays && p.preorderDays > 0 ? p.preorderDays : null]));
  const result: PreorderResult = { set: [], removed: [], failed: 0 };

  await withCabinet(shop, async (client) => {
    const offers = await client.listActiveOffers(shop.merchantId);
    const onSale = new Map(offers.map((o) => [o.sku, o]));

    for (const offer of offers.filter((o) => !days.get(o.sku) && isRestockedOnPreOrder(o))) {
      const key = `${shopId}:${offer.sku}`;
      if (recentlySent(key, null)) continue;
      lastSent.set(key, { days: null, at: Date.now() });
      try {
        await client.removePreOrder(shop.merchantId, offer);
        await prisma.product.updateMany({ where: { shopId, kaspiSku: offer.sku }, data: { preOrder: null } });
        result.removed.push(offer.sku);
      } catch (error) {
        result.failed++;
        console.warn(`[preorder] remove ${offer.sku} failed:`, error instanceof Error ? error.message : error);
      }
    }

    for (const product of products) {
      const offer = onSale.get(product.kaspiSku);
      const want = days.get(product.kaspiSku) ?? null;
      if (offer && !result.removed.includes(offer.sku)) {
        await prisma.product.update({ where: { id: product.id }, data: { preOrder: offer.preOrder } });
      }
      if (!want || offer?.preOrder === want) continue;

      const key = `${shopId}:${product.kaspiSku}`;
      if (recentlySent(key, want)) continue;
      lastSent.set(key, { days: want, at: Date.now() });
      try {
        await client.setPreOrder(shop.merchantId, product.kaspiSku, want);
        result.set.push(product.kaspiSku);
      } catch (error) {
        result.failed++;
        console.warn(`[preorder] set ${product.kaspiSku} failed:`, error instanceof Error ? error.message : error);
      }
    }
  });
  return result;
}
