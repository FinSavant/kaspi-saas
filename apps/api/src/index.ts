import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  NOT_SOLD_STATUSES,
  QUEUES,
  buildBreakdowns,
  buildSalesReport,
  buildWbBreakdowns,
  buildWbReport,
  parseWbReportFile,
  concatPdfs,
  minProfitablePrice,
  DEFAULT_TEMPLATES,
  TEMPLATE_PARAMS,
  redisConnectionFromUrl,
  READER_LAST_SEEN_KEY,
  SNAPSHOT_TTL_SEC,
  snapshotKey,
  telegramLinkCode,
  PLANS,
  SESSION_DAYS,
  MIN_PASSWORD_LENGTH,
  hashPassword,
  isValidEmail,
  newSessionToken,
  normalizeEmail,
  sessionTokenHash,
  verifyPassword,
  REVIEWS_ADDON_PRICE,
  TRIAL_DAYS,
  getPlan,
  subscriptionState,
  customExpensesPercent,
  parseCustomExpenses,
  MAX_CUSTOM_EXPENSES,
  ownerAccess,
  type OfferEditJob,
  type ReportJob,
  type OffersSnapshot,
  type OrdersSyncJob,
  type ProductsSyncJob,
  type ReportOrder,
  decryptSecret,
  encryptSecret,
  type WaybillLayout,
  type WaybillSort,
  type WaybillsJob,
} from '@kaspi/core';
import { prisma } from '@kaspi/db';
import {
  buildPriceListXml,
  isAwaitingHandover,
  KaspiCabinetAuthError,
  KaspiCabinetClient,
  KaspiClient,
} from '@kaspi/kaspi-client';
import { createStorage } from '@kaspi/storage';
import { Queue, QueueEvents } from 'bullmq';
import Fastify from 'fastify';

const internalKey = process.env.API_INTERNAL_KEY;
if (!internalKey) throw new Error('API_INTERNAL_KEY is required');

const connection = redisConnectionFromUrl(process.env.REDIS_URL ?? 'redis://localhost:6379');
const waybillsQueue = new Queue<WaybillsJob>(QUEUES.waybills, { connection });
const waybillsEvents = new QueueEvents(QUEUES.waybills, { connection });
const PRINT_TIMEOUT_MS = 180_000;
const storage = createStorage();
const productsSyncQueue = new Queue<ProductsSyncJob>(QUEUES.productsSync, { connection });
const productsSyncEvents = new QueueEvents(QUEUES.productsSync, { connection });
// Подсчёт продавцов идёт по одной карточке в секунду, поэтому ждём дольше печати
const SYNC_TIMEOUT_MS = 600_000;
const ordersSyncQueue = new Queue<OrdersSyncJob>(QUEUES.ordersSync, { connection });
const preorderQueue = new Queue(QUEUES.preorder, { connection });
const wbQueue = new Queue(QUEUES.wbSync, { connection });

/** Дни предзаказа поменялись — применяем сразу, не дожидаясь проверки раз в 5 минут. */
async function applyPreordersNow(): Promise<void> {
  await preorderQueue.add('preorder', {}, { jobId: `preorder-now-${Date.now()}`, removeOnComplete: 20, removeOnFail: 20 });
}

/**
 * Задачи «по кнопке» имеют постоянный jobId, чтобы повторное нажатие во время работы
 * не запускало вторую. Но выполненная задача с тем же jobId живёт в Redis, пока её
 * не уберут, — и новая не создаётся: add() вернул бы старую с прежним результатом.
 * Поэтому перед запуском завершённая задача удаляется.
 */
async function dropFinishedJob(queue: Queue, jobId: string): Promise<void> {
  const old = await queue.getJob(jobId);
  if (old && ['completed', 'failed'].includes(await old.getState())) await old.remove();
}

const app = Fastify({ logger: true });

// Открыты только проверка состояния и прайс-лист (его забирает сам Kaspi).
// Всё остальное вызывают web и bot с общим секретом; авторизация
// пользователей в этом каркасе не реализована.
const PUBLIC_PREFIXES = ['/health', '/feeds/'];

app.addHook('onRequest', async (request, reply) => {
  if (PUBLIC_PREFIXES.some((prefix) => request.url.startsWith(prefix))) return;

  const given = Buffer.from(String(request.headers['x-api-key'] ?? ''));
  const expected = Buffer.from(internalKey);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
});

declare module 'fastify' {
  interface FastifyRequest {
    /** Продавец, вошедший в веб-кабинет; нет — вызов от своих служб (бот, читатель цен) */
    user?: { id: string; isAdmin: boolean };
  }
}

// Веб-кабинет передаёт токен сессии продавца; бот и читатель цен ходят без него
const SESSION_HEADER = 'x-user-session';
// Разделы только для владельца платформы: админка, Wildberries, общие ставки комиссий, читатель цен
const ADMIN_ONLY = [/^\/admin(\/|$)/, /^\/shops\/[^/]+\/(wb|wildberries)(\/|$)/, /^\/commissions\//, /^\/reader\//];

/** Магазины, к которым относится запрос: из shopId, товара, склейки или списка склеек. */
async function requestShopIds(path: string, params: Record<string, string | undefined>, query: Record<string, string | undefined>) {
  const ids: string[] = [];
  if (params.shopId) ids.push(params.shopId);
  if (params.productId) {
    const product = await prisma.product.findUnique({ where: { id: params.productId }, select: { shopId: true } });
    ids.push(product?.shopId ?? '');
  }
  if (params.batchId) {
    const batch = await prisma.waybillBatch.findUnique({ where: { id: params.batchId }, select: { shopId: true } });
    ids.push(batch?.shopId ?? '');
  }
  if (path === '/waybill-batches/combined/pdf') {
    const batchIds = String(query.ids ?? '').split(',').filter(Boolean);
    const batches = await prisma.waybillBatch.findMany({ where: { id: { in: batchIds } }, select: { shopId: true } });
    ids.push(...batches.map((b) => b.shopId));
  }
  return [...new Set(ids)];
}

// Продавец видит только свои магазины; владелец платформы — все
app.addHook('preHandler', async (request, reply) => {
  const token = request.headers[SESSION_HEADER];
  if (typeof token !== 'string' || !token) return;
  const session = await prisma.session.findUnique({ where: { tokenHash: sessionTokenHash(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return reply.code(401).send({ error: 'login required' });
  request.user = { id: session.userId, isAdmin: session.user.isAdmin };
  if (request.user.isAdmin) return;

  const path = request.url.split('?')[0]!;
  if (ADMIN_ONLY.some((re) => re.test(path))) return reply.code(403).send({ error: 'forbidden' });
  const shopIds = await requestShopIds(
    path,
    (request.params ?? {}) as Record<string, string | undefined>,
    (request.query ?? {}) as Record<string, string | undefined>,
  );
  if (shopIds.length > 0) {
    const owned = await prisma.shop.count({ where: { id: { in: shopIds }, ownerId: request.user.id } });
    if (owned !== shopIds.length) return reply.code(404).send({ error: 'shop not found' });
  }

  // Тариф истёк: открыты только вход, список магазинов и «Тарифы»; данные не трогаются
  if (EXPIRED_ALLOWED.some((re) => re.test(path))) return;
  if (!(await accessForUser(request.user.id)).active) {
    return reply.code(402).send({ error: 'Срок тарифа истёк. Обновите тариф, чтобы продолжить.', code: 'expired' });
  }
});

const EXPIRED_ALLOWED = [/^\/auth\//, /^\/shops$/, /^\/shops\/[^/]+\/billing$/];

async function accessForUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { subscription: true } });
  return ownerAccess(user);
}

async function accessForShop(shopId: string) {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { ownerId: true } });
  return { ownerId: shop.ownerId, ...(await accessForUser(shop.ownerId)) };
}

const preorderLimitError = (max: number) =>
  max === 0
    ? 'Предзаказ не входит в ваш тариф. Выберите «Старт» или «Pro» на вкладке «Тарифы».'
    : `Лимит тарифа: предзаказ до ${max} товаров. Увеличьте лимит на вкладке «Тарифы».`;

const robotLimitError = (max: number) =>
  `Лимит тарифа: робот ведёт до ${max} товаров. Увеличьте лимит на вкладке «Тарифы».`;

app.get('/health', async () => ({ status: 'ok' }));

async function startSession(userId: string) {
  const { token, tokenHash } = newSessionToken();
  await prisma.session.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + SESSION_DAYS * DAY_MS) } });
  return { token, maxAgeSec: SESSION_DAYS * 24 * 60 * 60 };
}

// Неудачные попытки входа по email: после 10 за 15 минут вход временно закрыт
const failedLogins = new Map<string, { count: number; since: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
function loginBlocked(email: string): boolean {
  const entry = failedLogins.get(email);
  if (!entry || Date.now() - entry.since > LOGIN_WINDOW_MS) return false;
  return entry.count >= 10;
}
function noteFailedLogin(email: string): void {
  const entry = failedLogins.get(email);
  if (!entry || Date.now() - entry.since > LOGIN_WINDOW_MS) failedLogins.set(email, { count: 1, since: Date.now() });
  else entry.count += 1;
}

/**
 * Регистрация продавца: аккаунт, пробный период и сессия. Email из SANQ_ADMIN_EMAIL
 * при первой регистрации получает аккаунт владельца платформы с его нынешними магазинами.
 */
app.post<{ Body: { email?: string; password?: string; name?: string } }>('/auth/register', async (request, reply) => {
  const email = normalizeEmail(String(request.body?.email ?? ''));
  const password = String(request.body?.password ?? '');
  const name = String(request.body?.name ?? '').trim() || null;
  if (!isValidEmail(email)) return reply.code(400).send({ error: 'Проверьте email.' });
  if (password.length < MIN_PASSWORD_LENGTH) return reply.code(400).send({ error: `Пароль — не короче ${MIN_PASSWORD_LENGTH} символов.` });
  if (await prisma.user.findUnique({ where: { email } })) return reply.code(409).send({ error: 'Этот email уже зарегистрирован. Войдите.' });

  const adminEmail = normalizeEmail(process.env.SANQ_ADMIN_EMAIL ?? '');
  const unclaimedAdmin = adminEmail && email === adminEmail ? await prisma.user.findFirst({ where: { isAdmin: true, email: null } }) : null;
  const user = unclaimedAdmin
    ? await prisma.user.update({
        where: { id: unclaimedAdmin.id },
        data: { email, passwordHash: hashPassword(password), name: name ?? unclaimedAdmin.name },
      })
    : await prisma.user.create({ data: { email, passwordHash: hashPassword(password), name } });
  await ownerSubscription(user.id);
  return startSession(user.id);
});

app.post<{ Body: { email?: string; password?: string } }>('/auth/login', async (request, reply) => {
  const email = normalizeEmail(String(request.body?.email ?? ''));
  const password = String(request.body?.password ?? '');
  if (loginBlocked(email)) return reply.code(429).send({ error: 'Слишком много попыток. Попробуйте через 15 минут.' });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    noteFailedLogin(email);
    return reply.code(401).send({ error: 'Неверный email или пароль.' });
  }
  failedLogins.delete(email);
  return startSession(user.id);
});

app.post('/auth/logout', async (request) => {
  const token = request.headers[SESSION_HEADER];
  if (typeof token === 'string' && token) await prisma.session.deleteMany({ where: { tokenHash: sessionTokenHash(token) } });
  return { ok: true };
});

app.get('/auth/me', async (request, reply) => {
  if (!request.user) return reply.code(401).send({ error: 'login required' });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: request.user.id } });
  return { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
});


app.get<{ Params: { shopId: string } }>('/feeds/:shopId/price.xml', async (request, reply) => {
  const shop = await prisma.shop.findUnique({
    where: { id: request.params.shopId },
    include: { products: true },
  });
  if (!shop) return reply.code(404).send({ error: 'shop not found' });

  const xml = buildPriceListXml({
    company: shop.name,
    merchantId: shop.merchantId,
    offers: shop.products.map((p) => ({
      sku: p.kaspiSku,
      name: p.name,
      brand: p.brand,
      price: p.price,
      // Остаток (stock) при импорте с витрины неизвестен, поэтому наличие
      // определяется только флагом available
      available: p.available,
    })),
  });
  return reply.type('application/xml; charset=utf-8').send(xml);
});

app.get<{ Params: { shopId: string } }>('/shops/:shopId/settings', async (request, reply) => {
  const shop = await prisma.shop.findUnique({ where: { id: request.params.shopId } });
  if (!shop) return reply.code(404).send({ error: 'shop not found' });
  // Только признаки подключения: сами токен и сессия из api не выдаются
  return {
    name: shop.name,
    merchantId: shop.merchantId,
    cityId: shop.cityId,
    hasApiToken: !!shop.apiTokenEnc,
    hasCabinetSession: !!shop.mcSessionEnc,
    hasChatSession: !!shop.chatSessionEnc,
    chatPhone: shop.chatPhone ? `+7 ${shop.chatPhone.slice(0, 3)} ***-**-${shop.chatPhone.slice(-2)}` : null,
    // Свои логин и пароль магазина или общие из .env — тогда войти можно без ввода
    hasCabinetLogin: !!(shop.mcLoginEnc && shop.mcPasswordEnc) || !!(process.env.KASPI_MC_LOGIN && process.env.KASPI_MC_PASSWORD),
    productsSyncedAt: shop.productsSyncedAt,
    ordersSyncedAt: shop.ordersSyncedAt,
    repricerEnabled: shop.repricerEnabled,
    priceFeedPath: `/feeds/${shop.id}/price.xml`,
    fees: { commissionVatPercent: Number(shop.commissionVatPercent), paymentFeePercent: Number(shop.paymentFeePercent), taxPercent: Number(shop.taxPercent) },
    customExpenses: parseCustomExpenses(shop.customExpenses),
    markupPercents: shop.markupPercents,
  };
});

// Список — только свои магазины (и у владельца платформы тоже); чужие он открывает из админки
app.get('/shops', async (request) =>
  prisma.shop.findMany({
    where: request.user ? { ownerId: request.user.id } : {},
    select: { id: true, name: true, merchantId: true },
    orderBy: { createdAt: 'asc' },
  }),
);

const DAY_MS = 24 * 60 * 60 * 1000;
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;
const PRESETS = new Set(['today', 'yesterday', '7', '30', '90', '365']);

/** Начало суток по Алматы (UTC+5) для даты YYYY-MM-DD. */
const almatyDayStart = (date: string) => new Date(new Date(`${date}T00:00:00Z`).getTime() - ALMATY_OFFSET_MS);
const almatyToday = () => new Date(Date.now() + ALMATY_OFFSET_MS).toISOString().slice(0, 10);

/** Период аналитики: готовый пресет или свои даты (YYYY-MM-DD, включительно). */
function resolvePeriod(query: { period?: string; from?: string; to?: string }): { from: Date; to: Date; key: string } | null {
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (isDate(query.from) && isDate(query.to)) {
    const from = almatyDayStart(query.from!);
    const to = new Date(almatyDayStart(query.to!).getTime() + DAY_MS - 1);
    return from <= to ? { from, to, key: 'custom' } : null;
  }
  const period = query.period ?? '30';
  if (!PRESETS.has(period)) return null;
  const todayStart = almatyDayStart(almatyToday());
  if (period === 'today') return { from: todayStart, to: new Date(), key: period };
  if (period === 'yesterday') return { from: new Date(todayStart.getTime() - DAY_MS), to: new Date(todayStart.getTime() - 1), key: period };
  return { from: new Date(todayStart.getTime() - (Number(period) - 1) * DAY_MS), to: new Date(), key: period };
}

/** Метка этапа для заказа в работе — как вкладки кабинета Kaspi. */
function stageOf(o: { state: string; courierTransmissionDate: Date | null }): string {
  switch (o.state) {
    case 'NEW':
      return 'Новые';
    case 'SIGN_REQUIRED':
      return 'Ждут подписания';
    case 'PICKUP':
      return 'Ждут самовывоза';
    case 'DELIVERY':
      return 'Доставка продавцом';
    case 'KASPI_DELIVERY':
      return o.courierTransmissionDate ? 'Переданы в доставку' : 'Упаковка и передача';
    default:
      return 'Прочие';
  }
}

/**
 * Аналитика продаж за период, итоги предыдущего такого же периода для
 * сравнения, разрезы для вкладок и нереализованная прибыль — заказы в работе.
 */
app.get<{ Params: { shopId: string }; Querystring: { period?: string; from?: string; to?: string } }>(
  '/shops/:shopId/analytics',
  async (request, reply) => {
    const { shopId } = request.params;
    const range = resolvePeriod(request.query);
    if (!range) return reply.code(400).send({ error: 'unknown period' });
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return reply.code(404).send({ error: 'shop not found' });

    const { from, to } = range;
    const length = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - length - 1);

    const include = { items: { include: { product: { select: { costPrice: true } } } } } as const;
    const [orders, openOrders, commissions, syncJob] = await Promise.all([
      prisma.order.findMany({ where: { shopId, createdAtKaspi: { gte: previousFrom, lte: to } }, include }),
      prisma.order.findMany({
        where: { shopId, status: { notIn: ['COMPLETED', ...NOT_SOLD_STATUSES] } },
        include,
      }),
      prisma.categoryCommission.findMany(),
      ordersSyncQueue.getJob(`orders-manual-${shopId}`),
    ]);
    const percentByCategory = new Map(commissions.map((c) => [c.category, Number(c.percent)]));

    const toReportOrder = (o: (typeof orders)[number]): ReportOrder => ({
      createdAt: o.createdAtKaspi,
      status: o.status,
      deliveryCost: o.deliveryCost,
      totalPrice: o.totalPrice,
      city: o.city,
      deliveryMode: o.deliveryMode,
      paymentMode: o.paymentMode,
      isKaspiDelivery: o.isKaspiDelivery,
      express: o.express,
      courierTransmissionDate: o.courierTransmissionDate,
      items: o.items.map((i) => ({
        sku: i.kaspiSku,
        productId: i.productId,
        name: i.name,
        categoryCode: i.category,
        categoryTitle: i.categoryTitle,
        quantity: i.quantity,
        totalPrice: i.totalPrice || i.unitPrice * i.quantity,
        // Себестоимость из карточки товара: её вводят вручную и могут поменять позже
        unitCost: i.product?.costPrice ?? i.costPrice,
      })),
    });
    const reportOrders = orders.map(toReportOrder);
    const fees = {
      commissionPercent: (code: string | null) => (code ? (percentByCategory.get(code) ?? null) : null),
      commissionVatPercent: Number(shop.commissionVatPercent),
      paymentFeePercent: Number(shop.paymentFeePercent),
      taxPercent: Number(shop.taxPercent),
      customExpenses: parseCustomExpenses(shop.customExpenses),
    };

    const current = buildSalesReport(reportOrders, { from, to, ...fees });
    const previous = buildSalesReport(reportOrders, { from: previousFrom, to: new Date(from.getTime() - 1), ...fees });
    const previousBreakdowns = buildBreakdowns(reportOrders, { from: previousFrom, to: new Date(from.getTime() - 1) });

    // Нереализованная прибыль: все заказы в работе, независимо от периода
    const openReport = buildSalesReport(openOrders.map(toReportOrder), {
      from: new Date(0),
      to: new Date(),
      include: 'inProgress',
      ...fees,
    });
    const stages = new Map<string, { orders: number; revenue: number }>();
    for (const o of openOrders) {
      const stage = stageOf(o);
      const s = stages.get(stage) ?? { orders: 0, revenue: 0 };
      s.orders++;
      s.revenue += o.items.reduce((sum, i) => sum + (i.totalPrice || i.unitPrice * i.quantity), 0) || o.totalPrice;
      stages.set(stage, s);
    }

    // Категории проданных за период товаров — для таблицы комиссий;
    // текущая себестоимость товаров — для её ввода прямо в таблице
    const soldCategories = new Map<string, string | null>();
    const unitCosts: Record<string, number | null> = {};
    for (const o of [...orders.filter((x) => x.createdAtKaspi >= from), ...openOrders]) {
      for (const i of o.items) {
        if (i.category) soldCategories.set(i.category, i.categoryTitle);
        if (i.productId) unitCosts[i.productId] = i.product?.costPrice ?? null;
      }
    }

    return {
      period: range.key,
      from,
      to,
      ordersSyncedAt: shop.ordersSyncedAt,
      breakdowns: buildBreakdowns(reportOrders, { from, to }),
      previousAvgProcessingHours: previousBreakdowns.avgProcessingHours,
      unrealized: {
        totals: openReport.totals,
        byProduct: openReport.byProduct,
        missing: openReport.missing,
        stages: [...stages].map(([stage, s]) => ({ stage, ...s })).sort((a, b) => b.revenue - a.revenue),
      },
      syncing: syncJob ? ['waiting', 'active', 'delayed'].includes(await syncJob.getState()) : false,
      ordersWithoutItems: await prisma.order.count({
        where: { shopId, itemsSyncedAt: null, status: { notIn: [...NOT_SOLD_STATUSES] }, createdAtKaspi: { gte: from } },
      }),
      current,
      previous: previous.totals,
      unitCosts,
      fees: { commissionVatPercent: fees.commissionVatPercent, paymentFeePercent: fees.paymentFeePercent, taxPercent: fees.taxPercent },
      customExpenses: fees.customExpenses,
      commissions: [...soldCategories].map(([category, title]) => ({
        category,
        title,
        percent: percentByCategory.get(category) ?? null,
      })),
    };
  },
);

app.post<{ Params: { shopId: string } }>('/shops/:shopId/orders/sync', async (request, reply) => {
  const { shopId } = request.params;
  if (!(await prisma.shop.findUnique({ where: { id: shopId }, select: { id: true } }))) {
    return reply.code(404).send({ error: 'shop not found' });
  }
  // Первая загрузка за 3 месяца идёт несколько минут, поэтому не ждём её
  await dropFinishedJob(ordersSyncQueue, `orders-manual-${shopId}`);
  const job = await ordersSyncQueue.add(
    'sync',
    { shopId },
    { jobId: `orders-manual-${shopId}`, removeOnComplete: { age: 60 }, removeOnFail: { age: 60 } },
  );
  return reply.code(202).send({ jobId: job.id });
});

// Раз в 5 минут: приветствие покупателю в чат уходит вскоре после заказа
const ORDERS_SYNC_MS = 5 * 60_000;

function encryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required');
  return key;
}

const trimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/**
 * Подключение магазина: проверяет API-токен запросом к Kaspi, сохраняет
 * токен и (если даны) логин и пароль кабинета зашифрованными и сразу
 * запускает загрузку заказов за год и её повтор раз в 5 минут.
 */
app.post<{ Body: { name?: string; merchantId?: string; apiToken?: string; mcLogin?: string; mcPassword?: string } }>(
  '/shops',
  async (request, reply) => {
    if (request.user) {
      const access = await accessForUser(request.user.id);
      const shops = await prisma.shop.count({ where: { ownerId: request.user.id } });
      if (shops >= access.maxShops) {
        return reply.code(402).send({ error: `Лимит тарифа: ${access.maxShops === 1 ? "1 магазин" : `до ${access.maxShops} магазинов`}. Увеличьте лимит на вкладке «Тарифы».`, code: 'limit' });
      }
    }
    const name = trimmed(request.body?.name);
    const merchantId = trimmed(request.body?.merchantId);
    const apiToken = trimmed(request.body?.apiToken);
    const mcLogin = trimmed(request.body?.mcLogin);
    const mcPassword = typeof request.body?.mcPassword === 'string' ? request.body.mcPassword : '';
    if (!name || !merchantId || !apiToken) return reply.code(400).send({ error: 'Заполните название, ID продавца и API-токен.' });
    if (!/^\d+$/.test(merchantId)) return reply.code(400).send({ error: 'ID продавца — только цифры.' });
    if (!!mcLogin !== !!mcPassword) return reply.code(400).send({ error: 'Укажите и логин, и пароль кабинета — или ни то, ни другое.' });
    if (await prisma.shop.findUnique({ where: { merchantId }, select: { id: true } })) {
      return reply.code(409).send({ error: 'Магазин с таким ID продавца уже подключён.' });
    }

    try {
      await new KaspiClient(apiToken).listOrders({ state: 'NEW', from: new Date(Date.now() - DAY_MS) });
    } catch (error) {
      const status = (error as { status?: number }).status;
      return reply.code(400).send({
        error: status === 401 || status === 403 ? 'Kaspi не принял API-токен. Проверьте его.' : 'Не удалось проверить токен в Kaspi. Попробуйте ещё раз.',
      });
    }

    const key = encryptionKey();
    // Магазин принадлежит вошедшему продавцу; без входа (скрипты) — служебному владельцу
    const owner = request.user
      ? { id: request.user.id }
      : await prisma.user.upsert({
          where: { phone: 'local-owner' },
          create: { phone: 'local-owner', passwordHash: '!', name: 'Локальный владелец', isAdmin: true },
          update: {},
        });
    const shop = await prisma.shop.create({
      data: {
        ownerId: owner.id,
        name,
        merchantId,
        apiTokenEnc: encryptSecret(apiToken, key),
        mcLoginEnc: mcLogin ? encryptSecret(mcLogin, key) : null,
        mcPasswordEnc: mcPassword ? encryptSecret(mcPassword, key) : null,
      },
    });

    await ordersSyncQueue.upsertJobScheduler(
      `orders-${shop.id}`,
      { every: ORDERS_SYNC_MS },
      { name: 'sync', data: { shopId: shop.id }, opts: { removeOnComplete: 20, removeOnFail: 20 } },
    );
    await dropFinishedJob(ordersSyncQueue, `orders-manual-${shop.id}`);
    await ordersSyncQueue.add('sync', { shopId: shop.id }, { jobId: `orders-manual-${shop.id}`, removeOnComplete: { age: 60 }, removeOnFail: { age: 60 } });
    return reply.code(201).send({ id: shop.id });
  },
);

// Начатые входы в кабинет, ждущие код из почты: куки между двумя запросами
// держим в памяти api, а не в базе — это недоделанная сессия
const pendingCabinetLogins = new Map<string, { client: KaspiCabinetClient; email: string; startedAt: number }>();
const PENDING_LOGIN_TTL_MS = 15 * 60_000;

async function saveCabinetSession(shopId: string, client: KaspiCabinetClient) {
  await prisma.shop.update({ where: { id: shopId }, data: { mcSessionEnc: encryptSecret(client.jar.toJSON(), encryptionKey()) } });
}

/** Сессия даёт доступ к товарам — значит, вход удался. */
async function finishCabinetLogin(shop: { id: string; merchantId: string }, client: KaspiCabinetClient) {
  await saveCabinetSession(shop.id, client);
  const offers = await client.listActiveOffers(shop.merchantId);
  await saveCabinetSession(shop.id, client);
  return { status: 'OK' as const, offers: offers.length };
}

const cabinetError = (error: unknown) =>
  error instanceof KaspiCabinetAuthError
    ? 'Kaspi не пустил в кабинет: проверьте логин и пароль.'
    : `Не удалось войти в кабинет Kaspi: ${error instanceof Error ? error.message : String(error)}`;

/** Вход в кабинет продавца. Новые логин и пароль сохраняются; без них берутся сохранённые. */
app.post<{ Params: { shopId: string }; Body: { login?: string; password?: string } }>(
  '/shops/:shopId/cabinet/login',
  async (request, reply) => {
    const shop = await prisma.shop.findUnique({ where: { id: request.params.shopId } });
    if (!shop) return reply.code(404).send({ error: 'shop not found' });
    const key = encryptionKey();
    let login = trimmed(request.body?.login);
    let password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (login && password) {
      await prisma.shop.update({
        where: { id: shop.id },
        data: { mcLoginEnc: encryptSecret(login, key), mcPasswordEnc: encryptSecret(password, key) },
      });
    } else if (shop.mcLoginEnc && shop.mcPasswordEnc) {
      login = decryptSecret(shop.mcLoginEnc, key);
      password = decryptSecret(shop.mcPasswordEnc, key);
    } else {
      login = process.env.KASPI_MC_LOGIN ?? '';
      password = process.env.KASPI_MC_PASSWORD ?? '';
    }
    if (!login || !password) return reply.code(400).send({ error: 'Укажите логин и пароль пользователя кабинета Kaspi.' });

    const client = new KaspiCabinetClient();
    try {
      const result = await client.login(login, password, shop.merchantId);
      if (result.status === 'MFA_REQUIRED') {
        pendingCabinetLogins.set(shop.id, { client, email: result.email, startedAt: Date.now() });
        return { status: 'MFA_REQUIRED', email: result.email };
      }
      return await finishCabinetLogin(shop, client);
    } catch (error) {
      request.log.warn({ trace: client.trace }, 'cabinet login failed');
      return reply.code(400).send({ error: cabinetError(error) });
    }
  },
);

// Начатые входы по телефону для чата, ждущие код из SMS (как pendingCabinetLogins)
const pendingChatLogins = new Map<string, { client: KaspiCabinetClient; phone: string; startedAt: number }>();

/**
 * Вход в кабинет по номеру телефона для чата с покупателями. Номер — пользователь
 * магазина с правами на заказы (как у Okto). Kaspi присылает SMS на этот номер.
 */
app.post<{ Params: { shopId: string }; Body: { phone?: string } }>('/shops/:shopId/chat/login', async (request, reply) => {
  const shop = await prisma.shop.findUnique({ where: { id: request.params.shopId } });
  if (!shop) return reply.code(404).send({ error: 'shop not found' });
  // Без номера — повторный вход тем же номером (кнопка в Telegram)
  const phone = trimmed(request.body?.phone) || shop.chatPhone || '';
  const client = new KaspiCabinetClient();
  try {
    const sentTo = await client.startPhoneLogin(phone);
    pendingChatLogins.set(shop.id, { client, phone: phone.replace(/\D/g, '').slice(-10), startedAt: Date.now() });
    return { status: 'SMS_SENT', sentTo };
  } catch (error) {
    request.log.warn({ trace: client.trace }, 'chat phone login failed');
    return reply.code(400).send({ error: `Kaspi не отправил SMS: ${error instanceof Error ? error.message : error}` });
  }
});

app.post<{ Params: { shopId: string }; Body: { code?: string } }>('/shops/:shopId/chat/code', async (request, reply) => {
  const shop = await prisma.shop.findUnique({ where: { id: request.params.shopId } });
  if (!shop) return reply.code(404).send({ error: 'shop not found' });
  const pending = pendingChatLogins.get(shop.id);
  if (!pending || Date.now() - pending.startedAt > PENDING_LOGIN_TTL_MS) {
    pendingChatLogins.delete(shop.id);
    return reply.code(400).send({ error: 'Вход устарел — запросите SMS ещё раз.' });
  }
  const code = trimmed(request.body?.code);
  if (!code) return reply.code(400).send({ error: 'Введите код из SMS.' });
  try {
    const result = await pending.client.submitSmsCode(code, shop.merchantId);
    if (result.status !== 'OK') return reply.code(400).send({ error: 'Kaspi запросил дополнительное подтверждение.' });
    pendingChatLogins.delete(shop.id);
    await prisma.shop.update({
      where: { id: shop.id },
      data: { chatSessionEnc: encryptSecret(pending.client.jar.toJSON(), encryptionKey()), chatPhone: pending.phone },
    });
    // Проверка: чат действительно открылся — читаем только число диалогов
    const data = await pending.client.chat<{ groups?: unknown[] }>('/api/v1/group/loadGroups/chat', { limit: 5, gts: Number.MAX_SAFE_INTEGER }, shop.merchantId);
    await prisma.shop.update({ where: { id: shop.id }, data: { chatSessionEnc: encryptSecret(pending.client.jar.toJSON(), encryptionKey()) } });
    return { status: 'OK', chats: data?.groups?.length ?? 0 };
  } catch (error) {
    request.log.warn({ trace: pending.client.trace }, 'chat sms code failed');
    const message = error instanceof Error ? error.message : String(error);
    return reply.code(400).send({
      error: /INVALID_AUTH_TICKET/.test(message)
        ? 'Вход выполнен, но чат недоступен: этот номер должен быть пользователем магазина с правами на заказы.'
        : `Не удалось войти: ${message}`,
    });
  }
});

/** Код из почты для начатого входа в кабинет. */
app.post<{ Params: { shopId: string }; Body: { code?: string } }>('/shops/:shopId/cabinet/code', async (request, reply) => {
  const shop = await prisma.shop.findUnique({ where: { id: request.params.shopId } });
  if (!shop) return reply.code(404).send({ error: 'shop not found' });
  const pending = pendingCabinetLogins.get(shop.id);
  if (!pending || Date.now() - pending.startedAt > PENDING_LOGIN_TTL_MS) {
    pendingCabinetLogins.delete(shop.id);
    return reply.code(400).send({ error: 'Вход устарел — нажмите «Войти» ещё раз.' });
  }
  const code = trimmed(request.body?.code);
  if (!code) return reply.code(400).send({ error: 'Введите код из письма Kaspi.' });
  try {
    const result = await pending.client.submitMfaCode(code, pending.email, shop.merchantId);
    if (result.status !== 'OK') return reply.code(400).send({ error: 'Kaspi не принял код. Проверьте его или запросите новый.' });
    pendingCabinetLogins.delete(shop.id);
    return await finishCabinetLogin(shop, pending.client);
  } catch (error) {
    request.log.warn({ trace: pending.client.trace }, 'cabinet mfa failed');
    return reply.code(400).send({ error: cabinetError(error) });
  }
});

/**
 * Читатель цен (scripts/price-reader.ts) работает на компьютере продавца, когда
 * сервер не может обращаться к витрине Kaspi. Задания — карточки товаров с
 * включённым ботом и карточки, где число продавцов ещё не посчитано.
 */
app.get('/reader/tasks', async () => {
  const products = await prisma.product.findMany({
    where: {
      kaspiMasterSku: { not: null },
      available: true,
      OR: [{ repricerSetting: { enabled: true }, shop: { repricerEnabled: true } }, { sellersCount: null }],
    },
    select: { kaspiMasterSku: true, repricerSetting: { select: { enabled: true } }, shop: { select: { cityId: true } } },
  });
  const tasks = new Map<string, { masterSku: string; cityId: string; repricer: boolean }>();
  for (const p of products) {
    const key = `${p.kaspiMasterSku}:${p.shop.cityId}`;
    const repricer = !!p.repricerSetting?.enabled || !!tasks.get(key)?.repricer;
    tasks.set(key, { masterSku: p.kaspiMasterSku!, cityId: p.shop.cityId, repricer });
  }
  // Сначала карточки бота: они нужны каждую минуту
  return [...tasks.values()].sort((a, b) => Number(b.repricer) - Number(a.repricer));
});

app.post<{ Body: { masterSku?: string; cityId?: string; offers?: unknown } }>('/reader/offers', async (request, reply) => {
  const masterSku = trimmed(request.body?.masterSku);
  const cityId = trimmed(request.body?.cityId);
  const offers = Array.isArray(request.body?.offers) ? request.body.offers : null;
  if (!/^\d+$/.test(masterSku) || !/^\d+$/.test(cityId) || !offers) return reply.code(400).send({ error: 'bad snapshot' });
  const clean = offers
    .map((o: any) => ({
      merchantId: String(o?.merchantId ?? ''),
      merchantName: typeof o?.merchantName === 'string' ? o.merchantName.slice(0, 200) : undefined,
      price: Math.round(Number(o?.price)),
    }))
    .filter((o) => o.merchantId && Number.isFinite(o.price) && o.price > 0);

  const snapshot: OffersSnapshot = { at: new Date().toISOString(), offers: clean };
  const redis = await ordersSyncQueue.client;
  await redis.set(snapshotKey({ masterSku, cityId }), JSON.stringify(snapshot), { EX: SNAPSHOT_TTL_SEC });
  // Отметка «читатель цен жив» — бот и отчёт предупреждают, если она устарела
  await redis.set(READER_LAST_SEEN_KEY, String(Date.now()));
  // Число продавцов в карточке — для списка «открытых» карточек
  await prisma.product.updateMany({
    where: { kaspiMasterSku: masterSku, shop: { cityId } },
    data: { sellersCount: clean.length },
  });
  return { ok: true, offers: clean.length };
});

const reportsQueue = new Queue<ReportJob>(QUEUES.reports, { connection });
let botUsername: string | null = null;

/** Имя бота для ссылки t.me — спрашиваем у Telegram один раз. */
async function telegramBotUsername(): Promise<string | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (!botUsername) {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`).catch(() => null);
    const body = res?.ok ? ((await res.json()) as { result?: { username?: string } }) : null;
    botUsername = body?.result?.username ?? null;
  }
  return botUsername;
}

// Вход через Telegram: браузер получает одноразовый код и ссылку на бота, продавец
// подтверждает вход в боте, браузер обменивает подтверждённый код на сессию.
// В Redis: tg-login:<код> = «pending» или id продавца; живёт 10 минут.
const TG_LOGIN_TTL_SEC = 600;
const tgLoginKey = (code: string) => `tg-login:${code}`;

app.post('/auth/telegram/start', async (_request, reply) => {
  const username = await telegramBotUsername();
  if (!username) return reply.code(503).send({ error: 'Вход через Telegram пока недоступен.' });
  const code = randomBytes(12).toString('hex');
  await (await ordersSyncQueue.client).set(tgLoginKey(code), 'pending', { EX: TG_LOGIN_TTL_SEC });
  return { code, url: `https://t.me/${username}?start=login_${code}` };
});

/** Вызывает бот, когда продавец нажал «Подтвердить вход». Нового продавца регистрирует. */
app.post<{ Body: { code?: string; chatId?: string; name?: string } }>('/auth/telegram/confirm', async (request, reply) => {
  if (request.user) return reply.code(403).send({ error: 'forbidden' });
  const code = String(request.body?.code ?? '');
  const chatId = String(request.body?.chatId ?? '');
  const redis = await ordersSyncQueue.client;
  if (!chatId || (await redis.get(tgLoginKey(code))) !== 'pending') {
    return reply.code(400).send({ error: 'Ссылка для входа устарела. Нажмите «Войти через Telegram» на сайте ещё раз.' });
  }
  let user = await prisma.user.findUnique({ where: { telegramChatId: chatId } });
  const created = !user;
  if (!user) {
    // Пароля нет: такой продавец входит только через Telegram
    user = await prisma.user.create({ data: { telegramChatId: chatId, passwordHash: '!', name: String(request.body?.name ?? '').trim() || null } });
    await ownerSubscription(user.id);
  }
  await redis.set(tgLoginKey(code), user.id, { EX: TG_LOGIN_TTL_SEC });
  return { ok: true, created };
});

/** Браузер спрашивает, подтверждён ли вход; при подтверждении получает сессию. */
app.post<{ Body: { code?: string } }>('/auth/telegram/finish', async (request, reply) => {
  const code = String(request.body?.code ?? '');
  const redis = await ordersSyncQueue.client;
  const value = code ? await redis.get(tgLoginKey(code)) : null;
  if (!value) return reply.code(410).send({ error: 'Время на вход истекло. Попробуйте ещё раз.' });
  if (value === 'pending') return { pending: true };
  await redis.del(tgLoginKey(code));
  return startSession(value);
});

/** Состояние Telegram владельца магазина и ссылка для привязки чата. */
app.get<{ Params: { shopId: string } }>('/shops/:shopId/telegram', async (request, reply) => {
  const shop = await prisma.shop.findUnique({ where: { id: request.params.shopId }, include: { owner: true } });
  if (!shop) return reply.code(404).send({ error: 'shop not found' });
  const username = await telegramBotUsername();
  return {
    configured: !!username,
    linked: !!shop.owner.telegramChatId,
    url: username ? `https://t.me/${username}?start=${telegramLinkCode(shop.ownerId, internalKey)}` : null,
  };
});

app.post<{ Params: { shopId: string } }>('/shops/:shopId/telegram/report', async (request, reply) => {
  const shop = await prisma.shop.findUnique({ where: { id: request.params.shopId }, include: { owner: true } });
  if (!shop) return reply.code(404).send({ error: 'shop not found' });
  if (!shop.owner.telegramChatId) return reply.code(400).send({ error: 'Сначала подключите Telegram.' });
  await reportsQueue.add('now', { chatId: shop.owner.telegramChatId }, { removeOnComplete: 20, removeOnFail: 20 });
  return reply.code(202).send({ ok: true });
});

/** Подписка продавца; у нового продавца создаётся с пробным периодом. */
async function ownerSubscription(userId: string) {
  return prisma.subscription.upsert({
    where: { userId },
    create: { userId, plan: 'start', trialEndsAt: new Date(Date.now() + TRIAL_DAYS * DAY_MS) },
    update: {},
  });
}

/** Сколько товаров под роботом и сколько магазинов у продавца — для лимитов тарифа. */
async function ownerUsage(userId: string) {
  const [shops, robotProducts, preorderProducts] = await Promise.all([
    prisma.shop.count({ where: { ownerId: userId } }),
    prisma.repricerSetting.count({ where: { enabled: true, product: { shop: { ownerId: userId } } } }),
    prisma.product.count({ where: { preorderDays: { not: null }, shop: { ownerId: userId } } }),
  ]);
  return { shops, robotProducts, preorderProducts };
}

/** Номер WhatsApp владельца платформы для оплаты, только цифры (77001234567). */
const whatsappNumber = (process.env.SANQ_WHATSAPP ?? '').replace(/D/g, '') || null;

function serializeBilling(user: { isAdmin: boolean }, sub: Awaited<ReturnType<typeof ownerSubscription>>, usage: Awaited<ReturnType<typeof ownerUsage>>) {
  const state = subscriptionState(sub);
  return {
    isAdmin: user.isAdmin,
    plan: state.plan.id,
    status: user.isAdmin ? 'paid' : state.status,
    activeUntil: user.isAdmin ? null : state.activeUntil,
    reviewsAddon: sub.reviewsAddon,
    reviewsAllowed: user.isAdmin || state.reviewsAllowed,
    // Открытые разделы кабинета (меню и страницы прячут остальные)
    features: ownerAccess({ isAdmin: user.isAdmin, subscription: sub }).features,
    monthlyPrice: state.monthlyPrice,
    usage,
  };
}

async function billingFor(user: { id: string; isAdmin: boolean }) {
  const [sub, usage] = await Promise.all([ownerSubscription(user.id), ownerUsage(user.id)]);
  return {
    ...serializeBilling(user, sub, usage),
    plans: PLANS,
    reviewsAddonPrice: REVIEWS_ADDON_PRICE,
    trialDays: TRIAL_DAYS,
    whatsapp: whatsappNumber,
  };
}

/** Тариф, срок доступа и использование лимитов продавца, которому принадлежит магазин. */
app.get<{ Params: { shopId: string } }>('/shops/:shopId/billing', async (request, reply) => {
  const shop = await prisma.shop.findUnique({ where: { id: request.params.shopId }, include: { owner: true } });
  if (!shop) return reply.code(404).send({ error: 'shop not found' });
  return billingFor(shop.owner);
});

/** То же для вошедшего продавца — для экрана «обновите тариф», где магазина может не быть. */
app.get('/auth/billing', async (request, reply) => {
  if (!request.user) return reply.code(401).send({ error: 'login required' });
  return billingFor(await prisma.user.findUniqueOrThrow({ where: { id: request.user.id } }));
});

/** Админка владельца платформы: все продавцы и их подписки. */
app.get('/admin/subscriptions', async () => {
  const users = await prisma.user.findMany({
    include: { subscription: true, shops: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return Promise.all(
    users.map(async (u) => ({
      userId: u.id,
      name: u.name,
      login: u.email ?? u.phone ?? '',
      shops: u.shops.map((s) => s.name),
      trialEndsAt: u.subscription?.trialEndsAt ?? null,
      paidUntil: u.subscription?.paidUntil ?? null,
      ...serializeBilling(u, await ownerSubscription(u.id), await ownerUsage(u.id)),
    })),
  );
});

/** Ручное продление после оплаты в WhatsApp: тариф, доплата за отзывы и срок «оплачено до». */
app.put<{ Params: { userId: string }; Body: { plan?: string; reviewsAddon?: boolean; paidUntil?: string | null; addMonths?: number } }>(
  '/admin/subscriptions/:userId',
  async (request, reply) => {
    const { plan, reviewsAddon, paidUntil, addMonths } = request.body ?? {};
    if (plan !== undefined && getPlan(plan).id !== plan) return reply.code(400).send({ error: 'Неизвестный тариф' });
    const sub = await ownerSubscription(request.params.userId);
    let until: Date | null | undefined;
    if (paidUntil !== undefined) {
      until = paidUntil ? new Date(paidUntil) : null;
      if (until && Number.isNaN(until.getTime())) return reply.code(400).send({ error: 'Неверная дата' });
    }
    if (addMonths) {
      // Продление считается от конца текущей оплаты, если она ещё идёт, иначе от сегодня
      const base = sub.paidUntil && sub.paidUntil > new Date() ? new Date(sub.paidUntil) : new Date();
      base.setMonth(base.getMonth() + addMonths);
      until = base;
    }
    await prisma.subscription.update({
      where: { userId: request.params.userId },
      data: { plan, reviewsAddon, paidUntil: until },
    });
    return { ok: true };
  },
);

const isPercent = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

app.patch<{ Params: { shopId: string }; Body: { commissionVatPercent?: number; paymentFeePercent?: number; taxPercent?: number } }>(
  '/shops/:shopId/fees',
  async (request, reply) => {
    const { commissionVatPercent, paymentFeePercent, taxPercent } = request.body ?? {};
    for (const value of [commissionVatPercent, paymentFeePercent, taxPercent]) {
      if (value !== undefined && !isPercent(value)) return reply.code(400).send({ error: 'percent must be between 0 and 100' });
    }
    const shop = await prisma.shop.update({
      where: { id: request.params.shopId },
      data: { commissionVatPercent, paymentFeePercent, taxPercent },
      select: { commissionVatPercent: true, paymentFeePercent: true, taxPercent: true },
    });
    return {
      commissionVatPercent: Number(shop.commissionVatPercent),
      paymentFeePercent: Number(shop.paymentFeePercent),
      taxPercent: Number(shop.taxPercent),
    };
  },
);

/** Варианты наценки для «Мин. цены» робота: 1–3 целых процента прибыли от цены. */
app.put<{ Params: { shopId: string }; Body: { percents?: unknown } }>('/shops/:shopId/markups', async (request, reply) => {
  const raw = Array.isArray(request.body?.percents) ? request.body.percents : [];
  const percents = [...new Set(raw)].filter((v): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 90);
  if (percents.length === 0 || percents.length > 3 || percents.length !== raw.length) {
    return reply.code(400).send({ error: 'От 1 до 3 разных целых процентов, например 5 и 10.' });
  }
  percents.sort((a, b) => a - b);
  await prisma.shop.update({ where: { id: request.params.shopId }, data: { markupPercents: percents } });
  return { markupPercents: percents };
});

/** Свои расходы продавца: до 4 строк «название + % от выручки», учитываются в Аналитике и в мин. цене робота. */
app.put<{ Params: { shopId: string }; Body: { expenses?: unknown } }>('/shops/:shopId/expenses', async (request, reply) => {
  const raw = Array.isArray(request.body?.expenses) ? request.body.expenses : [];
  if (raw.length > MAX_CUSTOM_EXPENSES) return reply.code(400).send({ error: `Не больше ${MAX_CUSTOM_EXPENSES} строк.` });
  for (const e of raw) {
    if (typeof e?.percent !== 'number' || !isPercent(e.percent)) return reply.code(400).send({ error: 'Процент — число от 0 до 100.' });
  }
  const expenses = parseCustomExpenses(raw);
  await prisma.shop.update({ where: { id: request.params.shopId }, data: { customExpenses: expenses.map((e) => ({ ...e })) } });
  return { customExpenses: expenses };
});

app.put<{ Params: { category: string }; Body: { percent?: number | null; title?: string | null } }>(
  '/commissions/:category',
  async (request, reply) => {
    const { category } = request.params;
    const percent = request.body?.percent;
    if (percent === null || percent === undefined) {
      await prisma.categoryCommission.deleteMany({ where: { category } });
      return { category, percent: null };
    }
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      return reply.code(400).send({ error: 'percent must be between 0 and 100' });
    }
    const title = request.body?.title ?? null;
    return prisma.categoryCommission.upsert({
      where: { category },
      create: { category, title, percent },
      update: { percent, ...(title ? { title } : {}) },
    });
  },
);

const LAYOUTS: WaybillLayout[] = ['thermal', 'a4x4', 'a4x8'];

const SORTS: WaybillSort[] = ['none', 'product', 'product_city'];

type PrintBody = Partial<Omit<WaybillsJob, 'shopId' | 'reprintBatchId'>>;

/** Проверенные настройки печати из тела запроса; строка — текст ошибки. */
function parsePrintOptions(body: PrintBody | undefined): Omit<WaybillsJob, 'shopId'> | string {
  const layout = body?.layout ?? 'thermal';
  if (!LAYOUTS.includes(layout)) return 'unknown layout';
  // По умолчанию — по названию товара: накладные одного товара идут подряд
  const sort = body?.sort ?? 'product';
  if (!SORTS.includes(sort)) return 'unknown sort';
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined);
  const date = (value: unknown) => (typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : undefined);
  return {
    layout,
    sort,
    onlyNew: body?.onlyNew !== false,
    excludeExpress: body?.excludeExpress === true,
    createdFrom: date(body?.createdFrom),
    createdTo: date(body?.createdTo),
    cities: strings(body?.cities),
    skus: strings(body?.skus),
    orderCodes: strings(body?.orderCodes),
    telegramChatId: typeof body?.telegramChatId === 'string' ? body.telegramChatId : undefined,
  };
}

/**
 * Заказы из вкладки «Передача» с городами и товарами — для фильтров печати.
 * Товары запрашиваются у Kaspi по каждому заказу, поэтому только по запросу.
 */
app.get<{ Params: { shopId: string } }>('/shops/:shopId/waybills/candidates', async (request, reply) => {
  const shop = await prisma.shop.findUnique({ where: { id: request.params.shopId } });
  if (!shop) return reply.code(404).send({ error: 'shop not found' });
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) return reply.code(500).send({ error: 'TOKEN_ENCRYPTION_KEY is not set' });

  const client = new KaspiClient(decryptSecret(shop.apiTokenEnc, key));
  const orders = (await client.listOrders({ state: 'KASPI_DELIVERY', from: new Date(Date.now() - 14 * DAY_MS) }))
    .filter(isAwaitingHandover);
  const printed = new Set(
    (await prisma.printedWaybill.findMany({ where: { shopId: shop.id, orderCode: { in: orders.map((o) => o.code) } } })).map(
      (p) => p.orderCode,
    ),
  );
  const result = [];
  for (const order of orders) {
    const items = await client.getOrderEntries(order.id).catch(() => []);
    result.push({
      code: order.code,
      city: order.city,
      express: order.express,
      createdAt: order.createdAt,
      printed: printed.has(order.code),
      items: items.map((i) => ({ sku: i.sku, name: i.name, quantity: i.quantity })),
    });
  }
  return result;
});

/**
 * Экран «Сборка», как лист подбора на WB: заказы из «Передачи», сгруппированные по товару.
 * Позиции — из базы (их уже загрузила синхронизация заказов), у новых заказов — у Kaspi.
 */
app.get<{ Params: { shopId: string } }>('/shops/:shopId/picking', async (request, reply) => {
  const shop = await prisma.shop.findUnique({ where: { id: request.params.shopId } });
  if (!shop) return reply.code(404).send({ error: 'shop not found' });
  const client = new KaspiClient(decryptSecret(shop.apiTokenEnc, encryptionKey()));
  const orders = (await client.listOrders({ state: 'KASPI_DELIVERY', from: new Date(Date.now() - 14 * DAY_MS) })).filter(isAwaitingHandover);
  const codes = orders.map((o) => o.code);

  const [saved, marks] = await Promise.all([
    prisma.order.findMany({ where: { shopId: shop.id, code: { in: codes }, itemsSyncedAt: { not: null } }, include: { items: true } }),
    prisma.pickingMark.findMany({ where: { shopId: shop.id, orderCode: { in: codes } } }),
  ]);
  const savedItems = new Map(saved.map((o) => [o.code, o.items.map((i) => ({ sku: i.kaspiSku, name: i.name, quantity: i.quantity, categoryTitle: i.categoryTitle }))]));
  const lines: { orderCode: string; express: boolean; city: string | null; sku: string; name: string; quantity: number; categoryTitle: string | null }[] = [];
  for (const order of orders) {
    const items = savedItems.get(order.code) ?? (await client.getOrderEntries(order.id).catch(() => []));
    for (const i of items) {
      lines.push({ orderCode: order.code, express: order.express, city: order.city, sku: i.sku, name: i.name, quantity: i.quantity, categoryTitle: i.categoryTitle ?? null });
    }
  }

  const products = await prisma.product.findMany({
    where: { shopId: shop.id, kaspiSku: { in: [...new Set(lines.map((l) => l.sku))] } },
    select: { kaspiSku: true, name: true, imageUrl: true, brand: true },
  });
  const productBySku = new Map(products.map((p) => [p.kaspiSku, p]));
  const markOf = new Map(marks.map((m) => [`${m.orderCode}:${m.sku}`, m]));

  const groups = new Map<string, { sku: string; name: string; imageUrl: string | null; brand: string | null; categoryTitle: string | null; quantity: number; orders: object[] }>();
  for (const line of lines) {
    const product = productBySku.get(line.sku);
    const group = groups.get(line.sku) ?? {
      sku: line.sku,
      name: product?.name ?? line.name,
      imageUrl: product?.imageUrl ?? null,
      brand: product?.brand ?? null,
      categoryTitle: line.categoryTitle,
      quantity: 0,
      orders: [],
    };
    const mark = markOf.get(`${line.orderCode}:${line.sku}`);
    group.quantity += line.quantity;
    group.orders.push({
      code: line.orderCode,
      quantity: line.quantity,
      express: line.express,
      city: line.city,
      collected: mark?.collected ?? false,
      packed: mark?.packed ?? false,
    });
    groups.set(line.sku, group);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
});

/** Галочки «Собрано» / «Упаковано»: одна позиция или вся группа товара сразу. */
app.put<{ Params: { shopId: string }; Body: { marks?: { orderCode?: unknown; sku?: unknown; collected?: unknown; packed?: unknown }[] } }>(
  '/shops/:shopId/picking/marks',
  async (request, reply) => {
    const { shopId } = request.params;
    const marks = Array.isArray(request.body?.marks) ? request.body.marks : [];
    const valid = marks.filter((m) => typeof m.orderCode === 'string' && typeof m.sku === 'string');
    if (valid.length === 0) return reply.code(400).send({ error: 'marks are required' });
    const flags = (m: (typeof valid)[number]) => ({
      ...(typeof m.collected === 'boolean' && { collected: m.collected }),
      ...(typeof m.packed === 'boolean' && { packed: m.packed }),
    });
    await prisma.$transaction(
      valid.map((m) =>
        prisma.pickingMark.upsert({
          where: { shopId_orderCode_sku: { shopId, orderCode: m.orderCode as string, sku: m.sku as string } },
          create: { shopId, orderCode: m.orderCode as string, sku: m.sku as string, ...flags(m) },
          update: flags(m),
        }),
      ),
    );
    return { updated: valid.length };
  },
);

/** Накладная одного заказа — для печати прямо с экрана «Сборка». */
app.get<{ Params: { shopId: string; code: string } }>('/shops/:shopId/orders/:code/waybill', async (request, reply) => {
  const shop = await prisma.shop.findUnique({ where: { id: request.params.shopId } });
  if (!shop) return reply.code(404).send({ error: 'shop not found' });
  const order = await prisma.order.findUnique({ where: { shopId_code: { shopId: shop.id, code: request.params.code } } });
  if (!order?.waybillUrl) return reply.code(404).send({ error: 'У заказа нет накладной' });
  const pdf = await new KaspiClient(decryptSecret(shop.apiTokenEnc, encryptionKey())).downloadWaybill(order.waybillUrl);
  return reply
    .type('application/pdf')
    .header('Content-Disposition', `inline; filename="waybill-${order.code}.pdf"`)
    .send(Buffer.from(pdf));
});

app.post<{ Params: { shopId: string }; Body: PrintBody }>(
  '/shops/:shopId/waybills',
  async (request, reply) => {
    const options = parsePrintOptions(request.body);
    if (typeof options === 'string') return reply.code(400).send({ error: options });

    const { shopId } = request.params;
    if (!(await prisma.shop.findUnique({ where: { id: shopId }, select: { id: true } }))) {
      return reply.code(404).send({ error: 'shop not found' });
    }

    // Каждое нажатие — своя задача. Воркер склеивает по одной задаче за раз, поэтому
    // повторное нажатие не печатает заказы дважды: «только новые» отсеет уже напечатанные
    const job = await waybillsQueue.add(
      'print',
      { shopId, ...options },
      { jobId: `print-${shopId}-${Date.now()}`, removeOnComplete: { age: 600 }, removeOnFail: { age: 600 } },
    );
    // Склейка запускается по запросу, поэтому ждём результат и отдаём его сразу
    try {
      return await job.waitUntilFinished(waybillsEvents, PRINT_TIMEOUT_MS);
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: error instanceof Error ? error.message : 'print failed' });
    }
  },
);

app.post<{ Params: { batchId: string }; Body: { layout?: WaybillLayout } }>(
  '/waybill-batches/:batchId/reprint',
  async (request, reply) => {
    const layout = request.body?.layout ?? 'thermal';
    if (!LAYOUTS.includes(layout)) return reply.code(400).send({ error: 'unknown layout' });
    const source = await prisma.waybillBatch.findUnique({ where: { id: request.params.batchId } });
    if (!source) return reply.code(404).send({ error: 'batch not found' });

    const job = await waybillsQueue.add(
      'reprint',
      { shopId: source.shopId, layout, reprintBatchId: source.id },
      { jobId: `reprint-${source.id}-${Date.now()}`, removeOnComplete: { age: 600 }, removeOnFail: { age: 600 } },
    );
    try {
      return await job.waitUntilFinished(waybillsEvents, PRINT_TIMEOUT_MS);
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: error instanceof Error ? error.message : 'reprint failed' });
    }
  },
);

app.get<{ Params: { shopId: string } }>('/shops/:shopId/waybill-batches', async (request) =>
  prisma.waybillBatch.findMany({
    // Склейки хранятся сутки (воркер удаляет старые раз в час)
    where: { shopId: request.params.shopId, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, layout: true, count: true, createdAt: true },
  }),
);

app.get<{ Params: { batchId: string } }>('/waybill-batches/:batchId/pdf', async (request, reply) => {
  const batch = await prisma.waybillBatch.findUnique({ where: { id: request.params.batchId } });
  if (!batch) return reply.code(404).send({ error: 'batch not found' });

  const pdf = await storage.read(batch.storagePath);
  // Время в имени файла — алматинское, как в кабинете
  const date = batch.createdAt
    .toLocaleString('sv-SE', { timeZone: 'Asia/Almaty' })
    .slice(0, 16)
    .replace(/[-: ]/g, '');
  return reply
    .type('application/pdf')
    .header('Content-Disposition', `attachment; filename="waybills-${date}-${batch.count}.pdf"`)
    .send(Buffer.from(pdf));
});

/** Несколько склеек (обычно разных магазинов) одним файлом — в порядке ids. */
app.get<{ Querystring: { ids?: string } }>('/waybill-batches/combined/pdf', async (request, reply) => {
  const ids = String(request.query.ids ?? '').split(',').filter(Boolean).slice(0, 20);
  if (ids.length === 0) return reply.code(400).send({ error: 'ids required' });
  const batches = await prisma.waybillBatch.findMany({ where: { id: { in: ids } } });
  if (batches.length !== ids.length) return reply.code(404).send({ error: 'batch not found' });
  const ordered = ids.map((id) => batches.find((b) => b.id === id)!);
  const pdf = await concatPdfs(await Promise.all(ordered.map((b) => storage.read(b.storagePath))));
  const count = ordered.reduce((sum, b) => sum + b.count, 0);
  const date = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Almaty' }).slice(0, 16).replace(/[-: ]/g, '');
  return reply
    .type('application/pdf')
    .header('Content-Disposition', `attachment; filename="waybills-${date}-${count}.pdf"`)
    .send(Buffer.from(pdf));
});

app.post<{ Params: { shopId: string } }>('/shops/:shopId/products/sync', async (request, reply) => {
  const { shopId } = request.params;
  if (!(await prisma.shop.findUnique({ where: { id: shopId }, select: { id: true } }))) {
    return reply.code(404).send({ error: 'shop not found' });
  }
  // Повторное нажатие, пока синхронизация идёт, не создаёт вторую задачу
  await dropFinishedJob(productsSyncQueue, `sync-${shopId}`);
  const job = await productsSyncQueue.add(
    'sync',
    { shopId },
    { jobId: `sync-${shopId}`, removeOnComplete: { age: 60 }, removeOnFail: { age: 60 } },
  );
  try {
    return await job.waitUntilFinished(productsSyncEvents, SYNC_TIMEOUT_MS);
  } catch (error) {
    request.log.error(error);
    return reply.code(502).send({ error: error instanceof Error ? error.message : 'sync failed' });
  }
});

// Только товары в продаже; снятые с продажи остаются в базе вместе с настройками бота
/** Цены конкурентов за последние сутки старше этого не учитываются в месте товара. */
const POSITION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Товары магазина. По умолчанию — в продаже (и снятые, если для них настроен
 * предзаказ: их ждёт автопредзаказ); ?archived=1 — все снятые с продажи.
 * К каждому товару — место по цене в карточке и цена первого места
 * по последней проверке бота (все строки одной проверки имеют общее время).
 */
app.get<{ Params: { shopId: string }; Querystring: { archived?: string } }>('/shops/:shopId/products', async (request) => {
  const { shopId } = request.params;
  const products = await prisma.product.findMany({
    where:
      request.query.archived === '1'
        ? { shopId, available: false }
        : { shopId, OR: [{ available: true }, { preorderDays: { gt: 0 } }] },
    include: { repricerSetting: true },
    orderBy: { name: 'asc' },
  });
  const logs = await prisma.competitorLog.findMany({
    where: { productId: { in: products.map((p) => p.id) }, capturedAt: { gte: new Date(Date.now() - POSITION_MAX_AGE_MS) } },
    orderBy: { capturedAt: 'desc' },
    select: { productId: true, price: true, capturedAt: true },
  });
  const latest = new Map<string, { at: number; prices: number[] }>();
  for (const log of logs) {
    const entry = latest.get(log.productId);
    if (!entry) latest.set(log.productId, { at: log.capturedAt.getTime(), prices: [log.price] });
    else if (entry.at === log.capturedAt.getTime()) entry.prices.push(log.price);
  }

  // Для «Мин. цены» по вариантам наценки: удержания магазина и комиссия категории (у товара или по его продажам);
  // доставка — по тарифу Kaspi от самой цены (см. minProfitablePrice)
  const [shop, commissions, soldCategories] = await Promise.all([
    prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: { commissionVatPercent: true, paymentFeePercent: true, taxPercent: true, customExpenses: true, markupPercents: true },
    }),
    prisma.categoryCommission.findMany(),
    prisma.orderItem.findMany({
      where: { productId: { in: products.map((p) => p.id) }, category: { not: null } },
      distinct: ['productId'],
      select: { productId: true, category: true },
    }),
  ]);
  const percentByCategory = new Map(commissions.map((c) => [c.category, Number(c.percent)]));
  const soldCategory = new Map(soldCategories.map((i) => [i.productId!, i.category!]));
  const markups = [...shop.markupPercents].sort((a, b) => a - b);
  const minPrices = (p: (typeof products)[number]) => {
    const commission = percentByCategory.get(p.category ?? '') ?? percentByCategory.get(soldCategory.get(p.id) ?? '');
    if (p.costPrice == null || commission === undefined) return [];
    return markups.map((percent) => {
      const min = minProfitablePrice({
        costPrice: p.costPrice!,
        commissionPercent: commission,
        commissionVatPercent: Number(shop.commissionVatPercent),
        paymentFeePercent: Number(shop.paymentFeePercent),
        taxPercent: Number(shop.taxPercent) + customExpensesPercent(parseCustomExpenses(shop.customExpenses)),
        margin: percent / 100,
        weightKg: p.weightKg,
      });
      return { percent, price: min?.price ?? null, delivery: min?.delivery ?? null };
    });
  };

  return products.map((p) => {
    const competitors = latest.get(p.id)?.prices;
    const variants = minPrices(p);
    return {
      ...p,
      // Наименьший вариант наценки — порог, ниже которого мин. цена робота подсвечивается
      minProfitablePrice: variants[0]?.price ?? null,
      minPriceDelivery: variants[0]?.delivery ?? null,
      minPrices: variants,
      // Место: 1 + число конкурентов дешевле нас; при равной цене считаем, что мы не ниже их
      position: competitors ? 1 + competitors.filter((price) => price < p.price).length : null,
      topCompetitorPrice: competitors?.length ? Math.min(...competitors) : null,
      checkedAt: latest.has(p.id) ? new Date(latest.get(p.id)!.at) : null,
    };
  });
});

const isNonNegativeInt = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

// Себестоимость и дни автопредзаказа вводятся вручную; null очищает значение
app.patch<{ Params: { productId: string }; Body: { costPrice?: number | null; preorderDays?: number | null; weightKg?: number | null } }>(
  '/products/:productId',
  async (request, reply) => {
    const { costPrice, preorderDays, weightKg } = request.body ?? {};
    if (costPrice === undefined && preorderDays === undefined && weightKg === undefined) {
      return reply.code(400).send({ error: 'costPrice, preorderDays or weightKg is required' });
    }
    if (weightKg !== undefined && weightKg !== null && !(typeof weightKg === 'number' && weightKg > 0 && weightKg <= 1000)) {
      return reply.code(400).send({ error: 'Вес — число килограммов, например 12.' });
    }
    if (costPrice !== undefined && costPrice !== null && !isNonNegativeInt(costPrice)) {
      return reply.code(400).send({ error: 'costPrice must be a non-negative integer or null' });
    }
    if (preorderDays !== undefined && preorderDays !== null && !(Number.isInteger(preorderDays) && preorderDays >= 1 && preorderDays <= 30)) {
      return reply.code(400).send({ error: 'Предзаказ — от 1 до 30 дней (больше Kaspi не принимает).' });
    }
    const before = await prisma.product.findUniqueOrThrow({ where: { id: request.params.productId }, select: { preorderDays: true, shopId: true } });
    if (preorderDays != null && before.preorderDays == null) {
      const access = await accessForShop(before.shopId);
      const used = await prisma.product.count({ where: { preorderDays: { not: null }, shop: { ownerId: access.ownerId } } });
      if (used >= access.maxPreorderProducts) return reply.code(402).send({ error: preorderLimitError(access.maxPreorderProducts), code: 'limit' });
    }
    const product = await prisma.product.update({
      where: { id: request.params.productId },
      data: {
        ...(costPrice !== undefined && { costPrice }),
        ...(preorderDays !== undefined && { preorderDays }),
        // Вес, введённый вручную, синхронизация больше не перезаписывает; пусто — снова из карточки
        ...(weightKg !== undefined && { weightKg, weightManual: weightKg !== null }),
      },
    });
    if (preorderDays !== undefined && preorderDays !== before.preorderDays) await applyPreordersNow();
    return product;
  },
);

// Остатки приходят извне пачкой по артикулам продавца
app.put<{ Params: { shopId: string }; Body: { items?: { sku?: unknown; stock?: unknown }[] } }>(
  '/shops/:shopId/stocks',
  async (request, reply) => {
    const items = request.body?.items;
    if (!Array.isArray(items) || items.length === 0) return reply.code(400).send({ error: 'items is required' });
    for (const item of items) {
      if (typeof item?.sku !== 'string' || !isNonNegativeInt(item.stock)) {
        return reply.code(400).send({ error: 'each item needs a string sku and a non-negative integer stock' });
      }
    }

    const { shopId } = request.params;
    const results = await prisma.$transaction(
      items.map((item) =>
        prisma.product.updateMany({
          where: { shopId, kaspiSku: item.sku as string },
          data: { stock: item.stock as number },
        }),
      ),
    );
    const unknownSkus = items.filter((_, index) => results[index]!.count === 0).map((item) => item.sku);
    return { updated: items.length - unknownSkus.length, unknownSkus };
  },
);

interface RepricerPatch {
  enabled?: boolean;
  floorPrice?: number;
  ceilingPrice?: number | null;
  step?: number;
  checkIntervalSec?: number;
}

const isPositiveInt = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;

app.put<{ Params: { productId: string }; Body: RepricerPatch }>(
  '/products/:productId/repricer',
  async (request, reply) => {
    const { productId } = request.params;
    const body = request.body ?? {};
    const existing = await prisma.repricerSetting.findUnique({ where: { productId } });

    const floorPrice = body.floorPrice ?? existing?.floorPrice;
    const ceilingPrice = body.ceilingPrice === undefined ? existing?.ceilingPrice ?? null : body.ceilingPrice;
    const step = body.step ?? existing?.step ?? 1;
    const checkIntervalSec = body.checkIntervalSec ?? existing?.checkIntervalSec ?? 300;

    if (!isPositiveInt(floorPrice)) return reply.code(400).send({ error: 'floorPrice is required' });
    if (!isPositiveInt(step) || !isPositiveInt(checkIntervalSec)) {
      return reply.code(400).send({ error: 'step and checkIntervalSec must be positive integers' });
    }
    if (ceilingPrice != null && (!isPositiveInt(ceilingPrice) || ceilingPrice < floorPrice)) {
      return reply.code(400).send({ error: 'ceilingPrice must not be lower than floorPrice' });
    }

    const data = { enabled: body.enabled ?? existing?.enabled ?? false, floorPrice, ceilingPrice, step, checkIntervalSec };
    if (data.enabled && !existing?.enabled) {
      const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { shopId: true } });
      const access = await accessForShop(product.shopId);
      const used = await prisma.repricerSetting.count({ where: { enabled: true, product: { shop: { ownerId: access.ownerId } } } });
      if (used >= access.maxRobotProducts) return reply.code(402).send({ error: robotLimitError(access.maxRobotProducts), code: 'limit' });
    }
    return prisma.repricerSetting.upsert({ where: { productId }, create: { productId, ...data }, update: data });
  },
);

const offerEditQueue = new Queue<OfferEditJob>(QUEUES.offerEdit, { connection });
const offerEditEvents = new QueueEvents(QUEUES.offerEdit, { connection });

/** Правка цены, остатка или наличия склада из таблицы — сразу в кабинете Kaspi (через воркер). */
app.post<{ Params: { productId: string }; Body: { kind?: string; storeId?: string; value?: unknown } }>(
  '/products/:productId/edit',
  async (request, reply) => {
    const { productId } = request.params;
    const { kind, storeId, value } = request.body ?? {};
    let data: OfferEditJob;
    if (kind === 'price') {
      if (!isPositiveInt(value)) return reply.code(400).send({ error: 'Цена — целое число больше нуля.' });
      data = { productId, kind, value };
    } else if (kind === 'stock' && typeof storeId === 'string') {
      if (value !== null && !isNonNegativeInt(value)) return reply.code(400).send({ error: 'Остаток — целое число (пусто — без учёта).' });
      data = { productId, kind, storeId, value: value as number | null };
    } else if (kind === 'availability' && typeof storeId === 'string' && typeof value === 'boolean') {
      data = { productId, kind, storeId, value };
    } else {
      return reply.code(400).send({ error: 'Неизвестная правка.' });
    }
    if (!(await prisma.product.findUnique({ where: { id: productId }, select: { id: true } }))) {
      return reply.code(404).send({ error: 'product not found' });
    }
    const job = await offerEditQueue.add('edit', data, { removeOnComplete: { age: 600 }, removeOnFail: { age: 600 } });
    try {
      return await job.waitUntilFinished(offerEditEvents, 60_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'edit failed';
      return reply.code(502).send({
        error: /429|limit/i.test(message) ? 'Kaspi ограничил число изменений цены — попробуйте позже.' : message,
      });
    }
  },
);

/**
 * Себестоимость товара, которого нет в каталоге (снят с продажи до синхронизации):
 * создаётся скрытая карточка с этим артикулом, к ней привязываются все продажи —
 * так себестоимость учитывается и в прошлых, и в будущих заказах.
 */
app.put<{ Params: { shopId: string }; Body: { sku?: string; costPrice?: number | null } }>(
  '/shops/:shopId/sku-cost',
  async (request, reply) => {
    const { shopId } = request.params;
    const sku = trimmed(request.body?.sku);
    const costPrice = request.body?.costPrice ?? null;
    if (!sku) return reply.code(400).send({ error: 'sku is required' });
    if (costPrice !== null && !isNonNegativeInt(costPrice)) return reply.code(400).send({ error: 'Себестоимость — целое число в тенге.' });
    const sample = await prisma.orderItem.findFirst({
      where: { kaspiSku: sku, order: { shopId } },
      orderBy: { order: { createdAtKaspi: 'desc' } },
      select: { name: true, unitPrice: true },
    });
    if (!sample) return reply.code(404).send({ error: 'Продаж этого товара нет.' });
    const product = await prisma.product.upsert({
      where: { shopId_kaspiSku: { shopId, kaspiSku: sku } },
      create: { shopId, kaspiSku: sku, name: sample.name, price: sample.unitPrice, available: false, costPrice },
      update: { costPrice },
    });
    await prisma.orderItem.updateMany({ where: { kaspiSku: sku, productId: null, order: { shopId } }, data: { productId: product.id } });
    return { productId: product.id, costPrice };
  },
);

/** Заказы для раздела «Отзывы» за 14 дней со статусом сообщений; фильтр — как фишки в Okto. */
app.get<{ Params: { shopId: string }; Querystring: { filter?: string; q?: string } }>('/shops/:shopId/reviews', async (request) => {
  const { shopId } = request.params;
  const since = new Date(Date.now() - 14 * DAY_MS);
  const [orders, messages] = await Promise.all([
    prisma.order.findMany({
      where: { shopId, createdAtKaspi: { gte: since }, status: { notIn: [...NOT_SOLD_STATUSES] } },
      select: { code: true, status: true, createdAtKaspi: true, completedAt: true, plannedDeliveryDate: true, customerName: true, totalPrice: true },
      orderBy: { createdAtKaspi: 'desc' },
    }),
    prisma.reviewMessage.findMany({ where: { shopId, sentAt: { gte: new Date(since.getTime() - 7 * DAY_MS) } } }),
  ]);
  const byOrder = new Map<string, { NEW_ORDER?: (typeof messages)[number]; REVIEW?: (typeof messages)[number] }>();
  for (const m of messages) byOrder.set(m.orderCode, { ...byOrder.get(m.orderCode), [m.kind]: m });

  const rows = orders.map((o) => {
    const m = byOrder.get(o.code) ?? {};
    const failed = [m.NEW_ORDER, m.REVIEW].some((x) => x && ['FAILED', 'REJECTED', 'NO_CHAT'].includes(x.status));
    const stage = m.REVIEW?.repliedAt ? 'replied' : m.REVIEW?.status === 'SENT' ? 'requested' : failed ? 'failed' : 'new';
    return {
      ...o,
      stage,
      greeting: m.NEW_ORDER ? { status: m.NEW_ORDER.status, at: m.NEW_ORDER.sentAt, error: m.NEW_ORDER.error } : null,
      review: m.REVIEW ? { status: m.REVIEW.status, at: m.REVIEW.sentAt, error: m.REVIEW.error, repliedAt: m.REVIEW.repliedAt } : null,
    };
  });
  const counts: Record<string, number> = { all: rows.length, new: 0, requested: 0, replied: 0, failed: 0 };
  for (const r of rows) counts[r.stage]!++;
  const q = (request.query.q ?? '').trim().toLowerCase();
  const filter = request.query.filter;
  return {
    counts,
    rows: rows.filter(
      (r) => (!filter || filter === 'all' || r.stage === filter) && (!q || r.code.includes(q) || (r.customerName ?? '').toLowerCase().includes(q)),
    ),
  };
});

/** Настройки и шаблоны рассылки отзывов; включение запоминает момент — старые заказы не трогаем. */
app.get<{ Params: { shopId: string } }>('/shops/:shopId/reviews/settings', async (request, reply) => {
  const shop = await prisma.shop.findUnique({ where: { id: request.params.shopId } });
  if (!shop) return reply.code(404).send({ error: 'shop not found' });
  return {
    chatConnected: !!shop.chatSessionEnc,
    shopName: shop.name,
    reviewsEnabled: shop.reviewsEnabled,
    reviewHoursFrom: shop.reviewHoursFrom,
    reviewHoursTo: shop.reviewHoursTo,
    reviewDelayHours: shop.reviewDelayHours,
    newOrderMessages: shop.newOrderMessages,
    reviewMessages: shop.reviewMessages,
    newOrderTemplate: shop.newOrderTemplate ?? DEFAULT_TEMPLATES.NEW_ORDER,
    reviewTemplate: shop.reviewTemplate ?? DEFAULT_TEMPLATES.REVIEW,
    defaults: DEFAULT_TEMPLATES,
    params: TEMPLATE_PARAMS,
  };
});

app.patch<{
  Params: { shopId: string };
  Body: {
    reviewsEnabled?: boolean;
    reviewHoursFrom?: number;
    reviewHoursTo?: number;
    reviewDelayHours?: number;
    newOrderMessages?: boolean;
    reviewMessages?: boolean;
    newOrderTemplate?: string | null;
    reviewTemplate?: string | null;
  };
}>('/shops/:shopId/reviews/settings', async (request, reply) => {
  const shop = await prisma.shop.findUnique({ where: { id: request.params.shopId } });
  if (!shop) return reply.code(404).send({ error: 'shop not found' });
  const b = request.body ?? {};
  const hour = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 24;
  if (b.reviewHoursFrom !== undefined && !hour(b.reviewHoursFrom)) return reply.code(400).send({ error: 'Час — от 0 до 24.' });
  if (b.reviewHoursTo !== undefined && !hour(b.reviewHoursTo)) return reply.code(400).send({ error: 'Час — от 0 до 24.' });
  if (b.reviewDelayHours !== undefined && !(Number.isInteger(b.reviewDelayHours) && b.reviewDelayHours >= 0 && b.reviewDelayHours <= 24 * 30)) {
    return reply.code(400).send({ error: 'Задержка — от 0 часов до 30 дней.' });
  }
  for (const t of [b.newOrderTemplate, b.reviewTemplate]) {
    if (typeof t === 'string' && (t.trim().length < 5 || t.length > 3000)) return reply.code(400).send({ error: 'Текст шаблона — от 5 до 3000 символов.' });
  }
  if (b.reviewsEnabled && !shop.chatSessionEnc) return reply.code(400).send({ error: 'Сначала подключите чат в «Настройках».' });
  const turningOn = b.reviewsEnabled === true && !shop.reviewsEnabled;
  if (turningOn && !(await accessForShop(shop.id)).reviewsAllowed) {
    return reply.code(402).send({ error: 'Отзывы не входят в ваш тариф. Выберите «Старт» или «Pro» на вкладке «Тарифы».', code: 'limit' });
  }
  return prisma.shop.update({
    where: { id: shop.id },
    data: {
      ...(b.reviewsEnabled !== undefined && { reviewsEnabled: b.reviewsEnabled }),
      ...(turningOn && { reviewsEnabledAt: new Date() }),
      ...(b.reviewHoursFrom !== undefined && { reviewHoursFrom: b.reviewHoursFrom }),
      ...(b.reviewHoursTo !== undefined && { reviewHoursTo: b.reviewHoursTo }),
      ...(b.reviewDelayHours !== undefined && { reviewDelayHours: b.reviewDelayHours }),
      ...(b.newOrderMessages !== undefined && { newOrderMessages: b.newOrderMessages }),
      ...(b.reviewMessages !== undefined && { reviewMessages: b.reviewMessages }),
      // Текст, совпадающий со стандартным, храним как null: при обновлении стандарта он обновится сам
      ...(b.newOrderTemplate !== undefined && { newOrderTemplate: b.newOrderTemplate === DEFAULT_TEMPLATES.NEW_ORDER ? null : b.newOrderTemplate }),
      ...(b.reviewTemplate !== undefined && { reviewTemplate: b.reviewTemplate === DEFAULT_TEMPLATES.REVIEW ? null : b.reviewTemplate }),
    },
    select: { reviewsEnabled: true },
  });
});

const BULK_ACTIONS = ['enable', 'disable', 'step', 'floor', 'ceiling', 'preorder', 'cost'] as const;
type BulkAction = (typeof BULK_ACTIONS)[number];

/**
 * Массовые действия над выбранными товарами, как в Okto. Товары, к которым действие
 * не применимо, пропускаются и считаются: включить робота можно только с минимальной
 * ценой, шаг и макс. цена меняются только у настроенного робота, макс. не ниже мин.
 */
app.post<{ Params: { shopId: string }; Body: { productIds?: unknown; action?: BulkAction; value?: number | null } }>(
  '/shops/:shopId/products/bulk',
  async (request, reply) => {
    const { shopId } = request.params;
    const { action, value = null } = request.body ?? {};
    const ids = Array.isArray(request.body?.productIds) ? request.body.productIds.filter((id): id is string => typeof id === 'string') : [];
    if (!action || !BULK_ACTIONS.includes(action)) return reply.code(400).send({ error: 'Неизвестное действие.' });
    if (ids.length === 0) return reply.code(400).send({ error: 'Не выбрано ни одного товара.' });

    const needsValue = ['step', 'floor', 'ceiling'].includes(action);
    if (needsValue && !isPositiveInt(value) && !(action === 'ceiling' && value === null)) {
      return reply.code(400).send({ error: 'Укажите целое число больше нуля.' });
    }
    if (action === 'preorder' && value !== null && !(Number.isInteger(value) && value >= 1 && value <= 30)) {
      return reply.code(400).send({ error: 'Предзаказ — от 1 до 30 дней (пусто — убрать).' });
    }
    if (action === 'cost' && value !== null && !isNonNegativeInt(value)) {
      return reply.code(400).send({ error: 'Себестоимость — целое число в тенге (пусто — убрать).' });
    }

    const products = await prisma.product.findMany({ where: { shopId, id: { in: ids } }, include: { repricerSetting: true } });
    let updated = 0;
    const skipped: string[] = [];
    let robotSlots = Infinity;
    let robotMax = Infinity;
    if (action === 'enable') {
      const access = await accessForShop(shopId);
      const used = await prisma.repricerSetting.count({ where: { enabled: true, product: { shop: { ownerId: access.ownerId } } } });
      robotMax = access.maxRobotProducts;
      robotSlots = robotMax - used;
    }
    let preorderSlots = Infinity;
    let preorderMax = Infinity;
    if (action === 'preorder' && value !== null) {
      const access = await accessForShop(shopId);
      const used = await prisma.product.count({ where: { preorderDays: { not: null }, shop: { ownerId: access.ownerId } } });
      preorderMax = access.maxPreorderProducts;
      preorderSlots = preorderMax - used;
    }
    let limitHit = false;
    let preorderLimitHit = false;
    for (const p of products) {
      const s = p.repricerSetting;
      const setting = (data: { enabled?: boolean; step?: number; ceilingPrice?: number | null }) =>
        prisma.repricerSetting.update({ where: { productId: p.id }, data });

      if (action === 'preorder' && value !== null && p.preorderDays == null) {
        if (preorderSlots <= 0) {
          preorderLimitHit = true;
          skipped.push(p.name);
          continue;
        }
        preorderSlots--;
      }
      if (action === 'preorder' || action === 'cost') {
        await prisma.product.update({ where: { id: p.id }, data: action === 'preorder' ? { preorderDays: value } : { costPrice: value } });
      } else if (action === 'floor') {
        if (s?.ceilingPrice != null && s.ceilingPrice < value!) {
          skipped.push(p.name);
          continue;
        }
        await prisma.repricerSetting.upsert({
          where: { productId: p.id },
          create: { productId: p.id, floorPrice: value!, enabled: false },
          update: { floorPrice: value! },
        });
      } else if (action === 'disable') {
        if (!s?.enabled) continue;
        await setting({ enabled: false });
      } else if (!s || (action === 'ceiling' && value !== null && value < s.floorPrice)) {
        // Включить, шаг и макс. цена — только у товара с минимальной ценой
        skipped.push(p.name);
        continue;
      } else if (action === 'enable') {
        if (s.enabled) continue;
        if (robotSlots <= 0) {
          limitHit = true;
          skipped.push(p.name);
          continue;
        }
        robotSlots--;
        await setting({ enabled: true });
      } else {
        await setting(action === 'step' ? { step: value! } : { ceilingPrice: value });
      }
      updated++;
    }
    if (action === 'preorder') await applyPreordersNow();
    return {
      updated,
      skipped,
      ...(limitHit && { limit: robotLimitError(robotMax) }),
      ...(preorderLimitHit && { limit: preorderLimitError(preorderMax) }),
    };
  },
);

// ---------- Wildberries: отчёт о реализации, себестоимость ----------
// Кабинет WB привязан к владельцу магазинов; раздел открывается из любого его магазина

async function wbOwner(shopId: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { ownerId: true } });
  return shop?.ownerId ?? null;
}

async function startWbSync(accountId: string) {
  await wbQueue.add('wb-sync', { accountId }, { jobId: `wb-${accountId}-${Date.now()}`, removeOnComplete: 20, removeOnFail: 20 });
}

const DAY = 24 * 60 * 60 * 1000;

/** Кабинет WB владельца магазина или ответ 404. */
async function wbAccountFor(shopId: string) {
  const ownerId = await wbOwner(shopId);
  return ownerId ? prisma.wbAccount.findUnique({ where: { ownerId } }) : null;
}

const bigintOrNull = (v: string) => (/^\d+$/.test(v) ? BigInt(v) : null);

/** Строки отчётов в формат расчёта. */
const toWbRows = (rows: Awaited<ReturnType<typeof prisma.wbReportRow.findMany>>) =>
  rows.map((r) => ({ ...r, nmId: r.nmId === null ? null : String(r.nmId) }));

/** Период отчёта из файла: неделя (пн–вс) самой частой даты продажи. */
function weekOf(dates: Date[]): { from: Date; to: Date } | null {
  if (dates.length === 0) return null;
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(d.toISOString().slice(0, 10), (counts.get(d.toISOString().slice(0, 10)) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const day = new Date(`${top}T00:00:00Z`);
  const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY);
  return { from: monday, to: new Date(monday.getTime() + 6 * DAY) };
}

/** Состояние WB: подключён ли токен, налог, когда обновлялось. */
app.get<{ Params: { shopId: string } }>('/shops/:shopId/wb', async (request, reply) => {
  if (!(await wbOwner(request.params.shopId))) return reply.code(404).send({ error: 'shop not found' });
  const account = await wbAccountFor(request.params.shopId);
  if (!account) return { connected: false, hasToken: false };
  return {
    connected: true,
    hasToken: account.tokenEnc !== '',
    syncedAt: account.syncedAt,
    syncError: account.syncError,
    taxPercent: Number(account.taxPercent),
  };
});

/** Список отчётов с итогами — для страницы «Отчёты». */
app.get<{ Params: { shopId: string } }>('/shops/:shopId/wb/reports', async (request, reply) => {
  const account = await wbAccountFor(request.params.shopId);
  if (!account) return [];
  const [reports, rows, products] = await Promise.all([
    prisma.wbReport.findMany({ where: { accountId: account.id }, orderBy: [{ dateFrom: 'desc' }, { reportId: 'desc' }] }),
    prisma.wbReportRow.findMany({ where: { accountId: account.id } }),
    prisma.wbProduct.findMany({ where: { accountId: account.id, costPrice: { not: null } } }),
  ]);
  const costByNm = new Map(products.map((p) => [String(p.nmId), p.costPrice!]));
  const byReport = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = String(r.realizationreportId);
    byReport.set(key, [...(byReport.get(key) ?? []), r]);
  }
  return reports.map((rep) => {
    const { totals } = buildWbReport(toWbRows(byReport.get(String(rep.reportId)) ?? []), costByNm, Number(account.taxPercent));
    return {
      reportId: String(rep.reportId),
      dateFrom: rep.dateFrom,
      dateTo: rep.dateTo,
      source: rep.source,
      fileName: rep.fileName,
      uploadedAt: rep.uploadedAt,
      totals,
    };
  });
});

/** Отчёт или сводный отчёт по нескольким неделям: ?ids=1,2,3. */
app.get<{ Params: { shopId: string }; Querystring: { ids?: string } }>('/shops/:shopId/wb/report', async (request, reply) => {
  const account = await wbAccountFor(request.params.shopId);
  if (!account) return reply.code(404).send({ error: 'Wildberries не подключён' });
  const ids = (request.query.ids ?? '').split(',').map((s) => bigintOrNull(s.trim())).filter((v): v is bigint => v !== null);
  if (ids.length === 0) return reply.code(400).send({ error: 'Выберите отчёты' });

  const [reports, rows, products] = await Promise.all([
    prisma.wbReport.findMany({ where: { accountId: account.id, reportId: { in: ids } }, orderBy: { dateFrom: 'asc' } }),
    prisma.wbReportRow.findMany({ where: { accountId: account.id, realizationreportId: { in: ids } } }),
    prisma.wbProduct.findMany({ where: { accountId: account.id } }),
  ]);
  const costByNm = new Map(products.filter((p) => p.costPrice !== null).map((p) => [String(p.nmId), p.costPrice!]));
  const productByNm = new Map(products.map((p) => [String(p.nmId), p]));
  const wbRows = toWbRows(rows);
  const report = buildWbReport(wbRows, costByNm, Number(account.taxPercent));
  const dates = reports.flatMap((r) => [r.dateFrom, r.dateTo]).filter((d): d is Date => d !== null);
  return {
    reports: reports.map((r) => ({ reportId: String(r.reportId), dateFrom: r.dateFrom, dateTo: r.dateTo, source: r.source })),
    dateFrom: dates.length ? new Date(Math.min(...dates.map(Number))) : null,
    dateTo: dates.length ? new Date(Math.max(...dates.map(Number))) : null,
    taxPercent: Number(account.taxPercent),
    currency: rows.find((r) => r.currency)?.currency ?? 'KZT',
    totals: report.totals,
    byProduct: report.byProduct.map((p) => {
      const product = productByNm.get(p.nmId);
      return { ...p, title: product?.title ?? p.title, saName: product?.saName ?? p.saName };
    }),
    ...buildWbBreakdowns(wbRows),
  };
});

/**
 * Загрузка детализации отчёта из кабинета WB (zip или xlsx, в base64). Отчёт с тем же
 * номером заменяется целиком — в том числе пришедший через API.
 */
app.post<{ Params: { shopId: string }; Body: { fileName?: string; data?: string } }>(
  '/shops/:shopId/wb/reports/upload',
  { bodyLimit: 60 * 1024 * 1024 },
  async (request, reply) => {
    const ownerId = await wbOwner(request.params.shopId);
    if (!ownerId) return reply.code(404).send({ error: 'shop not found' });
    const fileName = trimmed(request.body?.fileName) || 'report.zip';
    const data = typeof request.body?.data === 'string' ? request.body.data : '';
    if (!data) return reply.code(400).send({ error: 'Файл пустой.' });

    let parsed;
    try {
      parsed = parseWbReportFile(new Uint8Array(Buffer.from(data, 'base64')), fileName);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Не удалось прочитать файл.' });
    }
    // Загрузка файлом работает и без токена API
    const account = await prisma.wbAccount.upsert({ where: { ownerId }, create: { ownerId, tokenEnc: '' }, update: {} });

    const result = [];
    for (const report of parsed) {
      if (!report.reportId) return reply.code(400).send({ error: `Не нашёл номер отчёта в имени файла «${report.fileName}». Загрузите файл с исходным именем из кабинета WB.` });
      const reportId = BigInt(report.reportId);
      const existing = await prisma.wbReport.findUnique({ where: { accountId_reportId: { accountId: account.id, reportId } } });
      const week = existing?.dateFrom ? { from: existing.dateFrom, to: existing.dateTo! } : weekOf(report.rows.filter((r) => r.quantity !== 0 && r.saleDate).map((r) => r.saleDate!));
      await prisma.$transaction([
        prisma.wbReportRow.deleteMany({ where: { accountId: account.id, realizationreportId: reportId } }),
        prisma.wbReportRow.createMany({
          data: report.rows.map(({ rowNo, nmId, ...r }) => ({
            ...r,
            nmId: nmId && /^\d+$/.test(nmId) ? BigInt(nmId) : null,
            accountId: account.id,
            // Строкам файла — свой номер, не пересекающийся с номерами строк API
            rrdId: -(reportId * 100_000n + BigInt(rowNo)),
            realizationreportId: reportId,
            currency: 'KZT',
          })),
        }),
        prisma.wbReport.upsert({
          where: { accountId_reportId: { accountId: account.id, reportId } },
          create: { accountId: account.id, reportId, source: 'file', fileName, rowsCount: report.rows.length, dateFrom: week?.from, dateTo: week?.to },
          update: { source: 'file', fileName, rowsCount: report.rows.length, uploadedAt: new Date(), dateFrom: week?.from, dateTo: week?.to },
        }),
      ]);
      // Товары из отчёта: в файле есть настоящие названия — обновляем их
      const items = new Map<string, { saName: string | null; title: string | null }>();
      for (const r of report.rows) if (r.nmId && /^\d+$/.test(r.nmId)) items.set(r.nmId, { saName: r.saName, title: r.title ?? r.subject });
      for (const [nm, p] of items) {
        await prisma.wbProduct.upsert({
          where: { accountId_nmId: { accountId: account.id, nmId: BigInt(nm) } },
          create: { accountId: account.id, nmId: BigInt(nm), ...p },
          update: { ...(p.saName && { saName: p.saName }), ...(p.title && { title: p.title }) },
        });
      }
      result.push({ reportId: report.reportId, rows: report.rows.length, dateFrom: week?.from ?? null, dateTo: week?.to ?? null });
    }
    return { reports: result };
  },
);

/** Удалить отчёт (например, загруженный по ошибке). */
app.delete<{ Params: { shopId: string; reportId: string } }>('/shops/:shopId/wb/reports/:reportId', async (request, reply) => {
  const account = await wbAccountFor(request.params.shopId);
  const reportId = bigintOrNull(request.params.reportId);
  if (!account || reportId === null) return reply.code(404).send({ error: 'Отчёт не найден' });
  await prisma.$transaction([
    prisma.wbReportRow.deleteMany({ where: { accountId: account.id, realizationreportId: reportId } }),
    prisma.wbReport.deleteMany({ where: { accountId: account.id, reportId } }),
  ]);
  return { ok: true };
});

/** Все товары WB: себестоимость и продажи за всё время. */
app.get<{ Params: { shopId: string } }>('/shops/:shopId/wb/products', async (request) => {
  const account = await wbAccountFor(request.params.shopId);
  if (!account) return [];
  const [products, rows] = await Promise.all([
    prisma.wbProduct.findMany({ where: { accountId: account.id } }),
    prisma.wbReportRow.findMany({ where: { accountId: account.id, nmId: { not: null } } }),
  ]);
  const { byProduct } = buildWbReport(toWbRows(rows), new Map(), 0);
  const stats = new Map(byProduct.map((p) => [p.nmId, p]));
  const lastSale = new Map<string, Date>();
  for (const r of rows) {
    if (r.docType !== 'Продажа' || r.quantity === 0 || !r.saleDate) continue;
    const key = String(r.nmId);
    if (!lastSale.has(key) || lastSale.get(key)! < r.saleDate) lastSale.set(key, r.saleDate);
  }
  return products
    .map((p) => {
      const s = stats.get(String(p.nmId));
      return {
        nmId: String(p.nmId),
        saName: p.saName,
        title: p.title,
        costPrice: p.costPrice,
        units: s?.units ?? 0,
        revenue: s?.revenue ?? 0,
        avgPrice: s && s.units > 0 ? Math.round(s.revenue / s.units) : null,
        // Вся логистика товара (с возвратами и отменами) и вознаграждение WB на одну проданную штуку
        deliveryPerUnit: s && s.units > 0 ? Math.round(s.delivery / s.units) : null,
        commissionPerUnit: s && s.units > 0 ? Math.round(s.commission / s.units) : null,
        lastSale: lastSale.get(String(p.nmId)) ?? null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
});

app.put<{ Params: { shopId: string }; Body: { token?: string } }>('/shops/:shopId/wb/token', async (request, reply) => {
  const ownerId = await wbOwner(request.params.shopId);
  if (!ownerId) return reply.code(404).send({ error: 'shop not found' });
  const token = trimmed(request.body?.token);
  if (token.length < 20) return reply.code(400).send({ error: 'Вставьте токен API из кабинета WB целиком.' });
  const tokenEnc = encryptSecret(token, encryptionKey());
  const account = await prisma.wbAccount.upsert({
    where: { ownerId },
    create: { ownerId, tokenEnc },
    update: { tokenEnc, syncError: null },
  });
  await startWbSync(account.id);
  return { ok: true };
});

app.post<{ Params: { shopId: string } }>('/shops/:shopId/wb/sync', async (request, reply) => {
  const ownerId = await wbOwner(request.params.shopId);
  const account = ownerId ? await prisma.wbAccount.findUnique({ where: { ownerId } }) : null;
  if (!account) return reply.code(404).send({ error: 'Wildberries не подключён' });
  await startWbSync(account.id);
  return { ok: true };
});

app.patch<{ Params: { shopId: string }; Body: { taxPercent?: number } }>('/shops/:shopId/wb/settings', async (request, reply) => {
  const ownerId = await wbOwner(request.params.shopId);
  const { taxPercent } = request.body ?? {};
  if (taxPercent === undefined || !isPercent(taxPercent)) return reply.code(400).send({ error: 'Налог — процент от 0 до 100.' });
  const account = ownerId ? await prisma.wbAccount.findUnique({ where: { ownerId } }) : null;
  if (!account) return reply.code(404).send({ error: 'Wildberries не подключён' });
  await prisma.wbAccount.update({ where: { id: account.id }, data: { taxPercent } });
  return { ok: true };
});

app.put<{ Params: { shopId: string; nmId: string }; Body: { costPrice?: number | null } }>(
  '/shops/:shopId/wb/products/:nmId/cost',
  async (request, reply) => {
    const ownerId = await wbOwner(request.params.shopId);
    const account = ownerId ? await prisma.wbAccount.findUnique({ where: { ownerId } }) : null;
    if (!account) return reply.code(404).send({ error: 'Wildberries не подключён' });
    const { costPrice = null } = request.body ?? {};
    if (costPrice !== null && !(typeof costPrice === 'number' && costPrice >= 0)) {
      return reply.code(400).send({ error: 'Себестоимость — число не меньше нуля.' });
    }
    if (!/^\d+$/.test(request.params.nmId)) return reply.code(400).send({ error: 'nmId must be a number' });
    const nmId = BigInt(request.params.nmId);
    await prisma.wbProduct.upsert({
      where: { accountId_nmId: { accountId: account.id, nmId } },
      create: { accountId: account.id, nmId, costPrice },
      update: { costPrice },
    });
    return { ok: true };
  },
);

await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? process.env.API_PORT ?? 4000) });
