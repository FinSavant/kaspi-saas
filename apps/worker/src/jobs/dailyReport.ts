import { buildSalesReport, NOT_SOLD_STATUSES, type ReportOrder } from '@kaspi/core';
import { prisma } from '@kaspi/db';
import { sendTelegramMessage } from '../telegram';
import { syncOrders } from './ordersSync';
import { syncProducts } from './productsSync';

const DAY_MS = 24 * 60 * 60 * 1000;
const ALMATY_OFFSET_MS = 5 * 60 * 60 * 1000;
/** Товар «заканчивается», когда остаток не больше порога (по умолчанию 3 шт). */
const LOW_STOCK = Number(process.env.LOW_STOCK_THRESHOLD ?? 3);

const tenge = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₸`;

/** Вчерашние сутки по Алматы. */
function yesterday(): { from: Date; to: Date; label: string } {
  const almatyNow = new Date(Date.now() + ALMATY_OFFSET_MS);
  const todayStart = Date.UTC(almatyNow.getUTCFullYear(), almatyNow.getUTCMonth(), almatyNow.getUTCDate()) - ALMATY_OFFSET_MS;
  const from = new Date(todayStart - DAY_MS);
  const label = new Date(from.getTime() + ALMATY_OFFSET_MS).toISOString().slice(0, 10).split('-').reverse().join('.');
  return { from, to: new Date(todayStart - 1), label };
}

type OrderWithItems = Awaited<ReturnType<typeof loadOrders>>[number];

function loadOrders(where: object) {
  return prisma.order.findMany({ where, include: { items: { include: { product: { select: { costPrice: true } } } } } });
}

function toReportOrder(o: OrderWithItems): ReportOrder {
  return {
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
      unitCost: i.product?.costPrice ?? i.costPrice,
    })),
  };
}

interface ShopSummary {
  text: string;
  delivered: number;
  payout: number;
}

async function shopReport(shopId: string, day: { from: Date; to: Date }): Promise<ShopSummary> {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId } });

  // Свежие заказы и остатки перед отчётом; если Kaspi недоступен — отчёт по тому, что есть
  const notes: string[] = [];
  await syncOrders(shopId).catch((e) => notes.push(`заказы не обновились: ${e instanceof Error ? e.message : e}`));
  await syncProducts(shopId, null).catch((e) => notes.push(`остатки не обновились: ${e instanceof Error ? e.message : e}`));

  const [created, delivered, open, commissions] = await Promise.all([
    prisma.order.findMany({ where: { shopId, createdAtKaspi: { gte: day.from, lte: day.to } }, select: { status: true, totalPrice: true } }),
    loadOrders({ shopId, status: 'COMPLETED', completedAt: { gte: day.from, lte: day.to } }),
    prisma.order.findMany({ where: { shopId, status: { notIn: ['COMPLETED', ...NOT_SOLD_STATUSES] } }, select: { totalPrice: true } }),
    prisma.categoryCommission.findMany(),
  ]);
  const percentByCategory = new Map(commissions.map((c) => [c.category, Number(c.percent)]));

  // Выданные вчера — по дате выдачи, независимо от даты заказа
  const report = buildSalesReport(delivered.map(toReportOrder), {
    from: new Date(0),
    to: new Date(),
    commissionPercent: (code) => (code ? (percentByCategory.get(code) ?? null) : null),
    commissionVatPercent: Number(shop.commissionVatPercent),
    paymentFeePercent: Number(shop.paymentFeePercent),
  });
  const t = report.totals;
  const payout = t.revenue - t.commission - t.commissionVat - t.paymentFee - t.delivery;

  const newOrders = created.filter((o) => !NOT_SOLD_STATUSES.has(o.status));
  const cancelled = created.length - newOrders.length;
  const lowStock = await prisma.product.findMany({
    // Товары на предзаказе не «заканчиваются»: остатка у них нет по определению
    where: { shopId, available: true, preOrder: null, stock: { lte: LOW_STOCK } },
    orderBy: [{ stock: 'asc' }, { name: 'asc' }],
    select: { name: true, stock: true },
  });

  const lines = [
    `🏪 ${shop.name}`,
    `🛒 Новых заказов: ${newOrders.length} на ${tenge(newOrders.reduce((s, o) => s + o.totalPrice, 0))}${cancelled ? ` (отменено ${cancelled})` : ''}`,
    `✅ Выдано: ${delivered.length} на ${tenge(t.revenue)}`,
    `💰 Поступит на счёт: ≈ ${tenge(payout)}`,
    `   (минус комиссия ${tenge(t.commission + t.commissionVat)}, Kaspi Pay ${tenge(t.paymentFee)}, доставка ${tenge(t.delivery)})`,
    t.costCoveragePercent && t.costCoveragePercent > 0
      ? `📈 Прибыль: ≈ ${tenge(t.netProfit)}${t.costCoveragePercent < 100 ? ` (себестоимость есть у ${Math.round(t.costCoveragePercent)}% выручки)` : ''}`
      : '📈 Прибыль: укажите себестоимость товаров',
    `🚚 В пути: ${open.length} заказов на ${tenge(open.reduce((s, o) => s + o.totalPrice, 0))}`,
  ];
  lines.push('', ...(await repricerLines(shopId)));
  if (lowStock.length > 0) {
    lines.push('', `⚠️ Заканчиваются (≤ ${LOW_STOCK} шт): ${lowStock.length}`);
    for (const p of lowStock.slice(0, 25)) lines.push(`• ${p.name} — ${p.stock === 0 ? 'нет в наличии' : `${p.stock} шт`}`);
    if (lowStock.length > 25) lines.push(`… и ещё ${lowStock.length - 25}`);
  } else {
    lines.push('', `📦 Остатки в норме (у всех больше ${LOW_STOCK} шт)`);
  }
  if (notes.length) lines.push('', `ℹ️ ${notes.join('; ')}`);
  return { text: lines.join('\n'), delivered: delivered.length, payout };
}

/**
 * Демпинг-бот: товары с ботом, сколько упёрлись в минимальную цену и сколько
 * стоят первыми по цене в карточке. Цены конкурентов — из последней проверки
 * бота (все строки одной проверки записаны одной транзакцией, время у них общее).
 */
async function repricerLines(shopId: string): Promise<string[]> {
  const settings = await prisma.repricerSetting.findMany({
    where: { enabled: true, product: { shopId, available: true } },
    select: { productId: true, floorPrice: true, product: { select: { name: true, price: true } } },
  });
  if (settings.length === 0) return ['🤖 Робот: не включён ни на одном товаре'];

  const logs = await prisma.competitorLog.findMany({
    where: { productId: { in: settings.map((s) => s.productId) }, capturedAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
    orderBy: { capturedAt: 'desc' },
    select: { productId: true, price: true, capturedAt: true },
  });
  const latest = new Map<string, { at: number; min: number }>();
  for (const log of logs) {
    const entry = latest.get(log.productId);
    if (!entry) latest.set(log.productId, { at: log.capturedAt.getTime(), min: log.price });
    else if (entry.at === log.capturedAt.getTime()) entry.min = Math.min(entry.min, log.price);
  }

  const atFloor = settings.filter((s) => s.product.price <= s.floorPrice);
  // Первые по цене: дешевле или так же, как самый дешёвый конкурент. Без свежих данных не считаем
  const checked = settings.filter((s) => latest.has(s.productId));
  const first = checked.filter((s) => s.product.price <= latest.get(s.productId)!.min);

  const lines = [
    `🤖 Робот: включён на ${settings.length} товарах`,
    `🥇 Первые по цене в карточке: ${first.length} из ${checked.length}${checked.length < settings.length ? ` (нет свежих цен по ${settings.length - checked.length} — читатель цен был выключен)` : ''}`,
    `🧱 Достигли минимальной цены: ${atFloor.length}`,
  ];
  for (const s of atFloor.slice(0, 10)) lines.push(`• ${s.product.name} — ${tenge(s.product.price)}`);
  if (atFloor.length > 10) lines.push(`… и ещё ${atFloor.length - 10}`);
  return lines;
}

/** Отчёт за вчера по всем магазинам владельца каждого привязанного чата. */
export async function sendDailyReports(onlyChatId?: string): Promise<{ sent: number }> {
  const users = await prisma.user.findMany({
    where: onlyChatId ? { telegramChatId: onlyChatId } : { telegramChatId: { not: null } },
    include: { shops: { orderBy: { createdAt: 'asc' }, select: { id: true } } },
  });
  const day = yesterday();
  let sent = 0;
  for (const user of users) {
    if (user.shops.length === 0) continue;
    const parts: ShopSummary[] = [];
    for (const shop of user.shops) parts.push(await shopReport(shop.id, day));

    const header = `📊 Отчёт за ${day.label}`;
    const total =
      parts.length > 1
        ? `\n\nИТОГО по ${parts.length} магазинам:\n✅ Выдано: ${parts.reduce((s, p) => s + p.delivered, 0)}\n💰 Поступит на счёт: ≈ ${tenge(parts.reduce((s, p) => s + p.payout, 0))}`
        : '';
    const message = `${header}\n\n${parts.map((p) => p.text).join('\n\n———\n\n')}${total}`;
    // В Telegram сообщение не длиннее 4096 символов: длинный отчёт — по магазину в сообщении
    if (message.length <= 4000) {
      await sendTelegramMessage(user.telegramChatId!, message);
    } else {
      for (const [i, p] of parts.entries()) await sendTelegramMessage(user.telegramChatId!, `${i === 0 ? `${header}\n\n` : ''}${p.text.slice(0, 4000)}`);
      if (total) await sendTelegramMessage(user.telegramChatId!, total.trim());
    }
    sent++;
  }
  return { sent };
}
