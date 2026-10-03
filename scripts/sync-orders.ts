// Загрузка заказов и их позиций для аналитики — то же, что кнопка «Обновить заказы»,
// но без воркера. Только читает данные из Kaspi API.
// Запуск: npm run sync:orders; с --full — заново за весь год
import { prisma } from '@kaspi/db';
import { syncOrders } from '../apps/worker/src/jobs/ordersSync';

const full = process.argv.includes('--full');
for (const shop of await prisma.shop.findMany({ select: { id: true, name: true } })) {
  const startedAt = Date.now();
  console.log(`Магазин «${shop.name}»: загружаю заказы${full ? ' за год' : ''}…`);
  const result = await syncOrders(shop.id, { full });
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `Готово за ${seconds} с: заказов — ${result.orders}, загружены товары по ${result.itemsLoaded} заказам` +
      (result.itemsFailed ? `, не удалось — ${result.itemsFailed} (загрузятся в следующий раз)` : '') +
      '.',
  );
}
await prisma.$disconnect();
