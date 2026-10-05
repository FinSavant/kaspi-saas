// Ставит один товар на предзаказ или снимает его — для проверки и ручного управления.
// Запуск: npx tsx scripts/preorder.ts <merchantId> "<часть названия или артикул>" <дней | off>
import { prisma } from '@kaspi/db';
import { withCabinet } from '../apps/worker/src/kaspi';

const [merchantId, query, daysArg] = process.argv.slice(2);
if (!merchantId || !query || !daysArg) {
  console.error('Использование: npx tsx scripts/preorder.ts <merchantId> "<название или артикул>" <дней | off>');
  process.exit(1);
}
const days = daysArg === 'off' ? null : Number(daysArg);

const shop = await prisma.shop.findUniqueOrThrow({ where: { merchantId } });
const products = await prisma.product.findMany({
  where: { shopId: shop.id, OR: [{ kaspiSku: query }, { name: { contains: query, mode: 'insensitive' } }] },
  select: { kaspiSku: true, name: true, stock: true },
});
if (products.length !== 1) {
  console.error(`Найдено товаров: ${products.length}. Уточните название.`, products.map((p) => p.name));
  process.exit(1);
}
const product = products[0]!;
console.log(`Товар: ${product.name} (остаток в базе: ${product.stock})`);

const result = await withCabinet(shop, async (client) => {
  console.log('Ответ Kaspi:', (await client.setPreOrder(merchantId, product.kaspiSku, days)).slice(0, 500));
  const details = await client.getOfferDetails(merchantId, product.kaspiSku);
  // Склады после изменения: наличие, остаток и всё, что похоже на предзаказ
  return (details.cityInfo ?? []).flatMap((c: any) =>
    (c.pickupPoints ?? []).map((p: any) => ({
      city: c.name,
      point: p.name,
      available: p.available,
      stock: p.stock,
      ...Object.fromEntries(Object.entries(p).filter(([k]) => /pre|order/i.test(k))),
    })),
  );
});
console.log(days ? `Отправлен предзаказ ${days} дн.` : 'Предзаказ снят.');
console.log(JSON.stringify(result, null, 1));
await prisma.$disconnect();
