import {
  MockCompetitorPriceSource,
  QUEUES,
  SnapshotPriceSource,
  redisConnectionFromUrl,
  type OrdersSyncJob,
  type ProductsSyncJob,
  type OfferEditJob,
  type ReportJob,
  type RepricerJob,
  type WaybillsJob,
} from '@kaspi/core';
import { KaspiStorefrontPriceSource } from '@kaspi/kaspi-client';
import { prisma } from '@kaspi/db';
import { createStorage } from '@kaspi/storage';
import { Queue, Worker } from 'bullmq';
import { sendDailyReports } from './jobs/dailyReport';
import { editOffer } from './jobs/offerEdit';
import { applyPreorders } from './jobs/preorder';
import { sendReviewMessages } from './jobs/reviews';
import { syncOrders } from './jobs/ordersSync';
import { syncProducts } from './jobs/productsSync';
import { enqueueDueProducts, repriceProduct } from './jobs/repricer';
import { printWaybills } from './jobs/waybills';

const connection = redisConnectionFromUrl(process.env.REDIS_URL ?? 'redis://localhost:6379');
const TICK_MS = 60_000;
// Раз в 5 минут: приветствие покупателю в чат уходит вскоре после заказа
const ORDERS_SYNC_MS = 5 * 60_000;

// Один экземпляр на весь воркер: пауза между запросами к витрине общая для
// репрайсера и подсчёта продавцов при синхронизации товаров
const storefront = new KaspiStorefrontPriceSource({
  minIntervalMs: Number(process.env.STOREFRONT_MIN_INTERVAL_MS ?? 1_000),
});

const storage = createStorage();
const repricerQueue = new Queue<RepricerJob>(QUEUES.repricer, { connection });

// COMPETITOR_SOURCE: mock — без запросов к витрине (разработка); remote — цены присылает
// читатель цен с компьютера продавца (scripts/price-reader.ts), сервер к витрине не ходит
const competitorSource = process.env.COMPETITOR_SOURCE;
const priceSource =
  competitorSource === 'mock'
    ? new MockCompetitorPriceSource()
    : competitorSource === 'remote'
      ? new SnapshotPriceSource(await repricerQueue.client)
      : storefront;
// Подсчёт продавцов при синхронизации товаров тоже идёт к витрине
const sellersCounter = competitorSource === 'mock' || competitorSource === 'remote' ? null : storefront;
console.log(`[worker] competitor prices: ${competitorSource || 'storefront'}`);

// REPRICER_PUBLISH=cabinet — бот меняет цены в кабинете Kaspi; иначе только считает их в базе
const publishPrices = process.env.REPRICER_PUBLISH === 'cabinet';
console.log(`[worker] repricer publishes prices to Kaspi: ${publishPrices ? 'yes' : 'no (database only)'}`);

await repricerQueue.upsertJobScheduler('tick', { every: TICK_MS }, { name: 'tick', data: {} });

// Заказы обновляются сами раз в 5 минут (аналитика и сообщения покупателям)
const ordersQueue = new Queue<OrdersSyncJob>(QUEUES.ordersSync, { connection });
for (const shop of await prisma.shop.findMany({ select: { id: true } })) {
  await ordersQueue.upsertJobScheduler(
    `orders-${shop.id}`,
    { every: ORDERS_SYNC_MS },
    { name: 'sync', data: { shopId: shop.id }, opts: { removeOnComplete: 20, removeOnFail: 20 } },
  );
}

// Ежедневный отчёт в Telegram в 09:10 по Алматы
const reportsQueue = new Queue<ReportJob>(QUEUES.reports, { connection });
await reportsQueue.upsertJobScheduler(
  'daily-report',
  { pattern: '10 9 * * *', tz: 'Asia/Almaty' },
  { name: 'daily', data: {}, opts: { removeOnComplete: 20, removeOnFail: 20 } },
);

// Автопредзаказ закончившихся товаров — каждые 5 минут по всем магазинам
const preorderQueue = new Queue(QUEUES.preorder, { connection });
await preorderQueue.upsertJobScheduler(
  'preorder',
  { every: 5 * 60_000 },
  { name: 'preorder', data: {}, opts: { removeOnComplete: 20, removeOnFail: 20 } },
);

// Отзывы: сообщения покупателям в чат Kaspi — каждые 2 минуты
const reviewsQueue = new Queue(QUEUES.reviews, { connection });
await reviewsQueue.upsertJobScheduler(
  'reviews',
  { every: 2 * 60_000 },
  { name: 'reviews', data: {}, opts: { removeOnComplete: 20, removeOnFail: 20 } },
);

async function reviewsForAllShops() {
  const shops = await prisma.shop.findMany({ where: { reviewsEnabled: true, chatSessionEnc: { not: null } }, select: { id: true } });
  const results = [];
  for (const shop of shops) {
    try {
      results.push({ shopId: shop.id, ...(await sendReviewMessages(shop.id)) });
    } catch (error) {
      results.push({ shopId: shop.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

async function preordersForAllShops() {
  // Все магазины со входом в кабинет: снимать забытый предзаказ нужно и без настроек дней
  const shops = await prisma.shop.findMany({ where: { mcSessionEnc: { not: null } }, select: { id: true } });
  const results = [];
  for (const shop of shops) {
    try {
      results.push({ shopId: shop.id, ...(await applyPreorders(shop.id)) });
    } catch (error) {
      results.push({ shopId: shop.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return results;
}

const workers = [
  new Worker(QUEUES.reviews, reviewsForAllShops, { connection }),
  new Worker<OfferEditJob>(QUEUES.offerEdit, async (job) => editOffer(job.data), { connection }),
  new Worker(QUEUES.preorder, preordersForAllShops, { connection }),
  new Worker<ReportJob>(QUEUES.reports, async (job) => sendDailyReports(job.data.chatId), { connection }),
  new Worker<RepricerJob>(
    QUEUES.repricer,
    async (job) =>
      job.data.productId
        ? repriceProduct(job.data.productId, priceSource, { publish: publishPrices })
        : enqueueDueProducts(repricerQueue),
    { connection, concurrency: 5 },
  ),
  new Worker<OrdersSyncJob>(QUEUES.ordersSync, async (job) => syncOrders(job.data.shopId), { connection }),
  // Склейки строго по одной: две одновременные могли бы напечатать один заказ дважды
  new Worker<WaybillsJob>(QUEUES.waybills, async (job) => printWaybills(job.data, storage), { connection, concurrency: 1 }),
  new Worker<ProductsSyncJob>(
    QUEUES.productsSync,
    async (job) => syncProducts(job.data.shopId, sellersCounter),
    { connection },
  ),
];

for (const worker of workers) {
  worker.on('failed', (job, error) => console.error(`[${worker.name}] job ${job?.id} failed:`, error));
  if (worker.name !== QUEUES.repricer) {
    worker.on('completed', (job, result) => console.log(`[${worker.name}] job ${job.id} done:`, JSON.stringify(result)));
  }
}

const shutdown = async () => {
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all([repricerQueue.close(), ordersQueue.close(), reportsQueue.close(), preorderQueue.close(), reviewsQueue.close()]);
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
