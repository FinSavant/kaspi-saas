// Состояние магазина и демпинг-бота: товары, настройки бота, последние изменения цен.
// Запуск: npm run status
// Только читает базу.

import { prisma } from '@kaspi/db';

const time = (d: Date | null) =>
  d ? d.toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'short', timeStyle: 'medium' }) : 'никогда';

for (const shop of await prisma.shop.findMany()) {
  const products = await prisma.product.findMany({ where: { shopId: shop.id, available: true } });
  const open = products.filter((p) => (p.sellersCount ?? 0) > 1).length;
  const unchecked = products.filter((p) => p.sellersCount === null).length;

  console.log(`Магазин «${shop.name}»${shop.repricerEnabled ? '' : ' — бот на паузе'}`);
  console.log(`  Синхронизация товаров: ${time(shop.productsSyncedAt)}`);
  console.log(`  В продаже: ${products.length}, открытых карточек: ${open}, не проверено продавцов: ${unchecked}`);

  const settings = await prisma.repricerSetting.findMany({
    where: { product: { shopId: shop.id } },
    include: { product: true },
    orderBy: { product: { name: 'asc' } },
  });
  const enabled = settings.filter((s) => s.enabled);
  console.log(`  Бот включён на ${enabled.length} товарах, проверено хотя бы раз: ${enabled.filter((s) => s.lastCheckedAt).length}`);
  for (const s of enabled) {
    const p = s.product;
    const ceiling = s.ceilingPrice ? `, макс. ${s.ceilingPrice}` : '';
    console.log(
      `    ${p.name.slice(0, 50).padEnd(50)} цена ${p.price}, мин. ${s.floorPrice}${ceiling}, шаг ${s.step}, ` +
        `продавцов ${p.sellersCount ?? '?'}, проверка: ${time(s.lastCheckedAt)}`,
    );
  }

  const changes = await prisma.priceChange.findMany({
    where: { product: { shopId: shop.id } },
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: { product: true },
  });
  console.log(`  Последние изменения цен: ${changes.length === 0 ? 'нет' : ''}`);
  for (const c of changes) {
    console.log(`    ${time(c.createdAt)}  ${c.oldPrice} → ${c.newPrice}  ${c.reason}  ${c.product.name.slice(0, 50)}`);
  }
}

await prisma.$disconnect();
