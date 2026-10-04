import { timingSafeEqual } from 'node:crypto';
import {
  NOT_SOLD_STATUSES,
  QUEUES,
  buildBreakdowns,
  buildSalesReport,
  concatPdfs,
  redisConnectionFromUrl,
  SNAPSHOT_TTL_SEC,
  snapshotKey,
  telegramLinkCode,
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

app.get('/health', async () => ({ status: 'ok' }));

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
    // Свои логин и пароль магазина или общие из .env — тогда войти можно без ввода
    hasCabinetLogin: !!(shop.mcLoginEnc && shop.mcPasswordEnc) || !!(process.env.KASPI_MC_LOGIN && process.env.KASPI_MC_PASSWORD),
    productsSyncedAt: shop.productsSyncedAt,
    ordersSyncedAt: shop.ordersSyncedAt,
    repricerEnabled: shop.repricerEnabled,
    priceFeedPath: `/feeds/${shop.id}/price.xml`,
    fees: { commissionVatPercent: Number(shop.commissionVatPercent), paymentFeePercent: Number(shop.paymentFeePercent) },
  };
});

app.get('/shops', async () =>
  prisma.shop.findMany({ select: { id: true, name: true, merchantId: true }, orderBy: { createdAt: 'asc' } }),
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
      fees: { commissionVatPercent: fees.commissionVatPercent, paymentFeePercent: fees.paymentFeePercent },
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
  const job = await ordersSyncQueue.add(
    'sync',
    { shopId },
    { jobId: `orders-manual-${shopId}`, removeOnComplete: { age: 60 }, removeOnFail: { age: 60 } },
  );
  return reply.code(202).send({ jobId: job.id });
});

const ORDERS_SYNC_MS = 30 * 60_000;

function encryptionKey(): string {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY is required');
  return key;
}

const trimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/**
 * Подключение магазина: проверяет API-токен запросом к Kaspi, сохраняет
 * токен и (если даны) логин и пароль кабинета зашифрованными и сразу
 * запускает загрузку заказов за год и её повтор раз в 30 минут.
 */
app.post<{ Body: { name?: string; merchantId?: string; apiToken?: string; mcLogin?: string; mcPassword?: string } }>(
  '/shops',
  async (request, reply) => {
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
    // Входа пользователей пока нет: все магазины у одного служебного владельца, как в add-shop
    const owner = await prisma.user.upsert({
      where: { phone: 'local-owner' },
      create: { phone: 'local-owner', passwordHash: '!', name: 'Локальный владелец' },
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
        subscription: { create: { status: 'TRIAL', trialEndsAt: new Date(Date.now() + 7 * DAY_MS) } },
      },
    });

    await ordersSyncQueue.upsertJobScheduler(
      `orders-${shop.id}`,
      { every: ORDERS_SYNC_MS },
      { name: 'sync', data: { shopId: shop.id }, opts: { removeOnComplete: 20, removeOnFail: 20 } },
    );
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

const isPercent = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;

app.patch<{ Params: { shopId: string }; Body: { commissionVatPercent?: number; paymentFeePercent?: number } }>(
  '/shops/:shopId/fees',
  async (request, reply) => {
    const { commissionVatPercent, paymentFeePercent } = request.body ?? {};
    for (const value of [commissionVatPercent, paymentFeePercent]) {
      if (value !== undefined && !isPercent(value)) return reply.code(400).send({ error: 'percent must be between 0 and 100' });
    }
    const shop = await prisma.shop.update({
      where: { id: request.params.shopId },
      data: { commissionVatPercent, paymentFeePercent },
      select: { commissionVatPercent: true, paymentFeePercent: true },
    });
    return { commissionVatPercent: Number(shop.commissionVatPercent), paymentFeePercent: Number(shop.paymentFeePercent) };
  },
);

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
    where: { shopId: request.params.shopId },
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
app.get<{ Params: { shopId: string } }>('/shops/:shopId/products', async (request) =>
  prisma.product.findMany({
    where: { shopId: request.params.shopId, available: true },
    include: { repricerSetting: true },
    orderBy: { name: 'asc' },
  }),
);

const isNonNegativeInt = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

// Себестоимость вводится вручную; null очищает значение
app.patch<{ Params: { productId: string }; Body: { costPrice?: number | null } }>(
  '/products/:productId',
  async (request, reply) => {
    const costPrice = request.body?.costPrice;
    if (costPrice === undefined) return reply.code(400).send({ error: 'costPrice is required' });
    if (costPrice !== null && !isNonNegativeInt(costPrice)) {
      return reply.code(400).send({ error: 'costPrice must be a non-negative integer or null' });
    }
    return prisma.product.update({ where: { id: request.params.productId }, data: { costPrice } });
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
    return prisma.repricerSetting.upsert({ where: { productId }, create: { productId, ...data }, update: data });
  },
);

await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? process.env.API_PORT ?? 4000) });
