import { isRealized, NOT_SOLD_STATUSES, type ReportOrder } from './salesReport';

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'Выдан',
  CANCELLED: 'Отменён',
  CANCELLING: 'Отменяется',
  RETURNED: 'Возвращён',
  KASPI_DELIVERY_RETURN_REQUESTED: 'Запрошен возврат',
  ACCEPTED_BY_MERCHANT: 'Принят, в работе',
  APPROVED_BY_BANK: 'Одобрен банком',
};

// Значения Kaspi API; неизвестные показываются кодом
const DELIVERY_LABELS: Record<string, string> = {
  DELIVERY_PICKUP: 'Пункт выдачи / постамат',
  DELIVERY_LOCAL: 'Курьер по городу',
  DELIVERY_REGIONAL_TODOOR: 'Курьер в другой город',
  DELIVERY_REGIONAL_PICKUP: 'Пункт выдачи в другом городе',
};

const PAYMENT_LABELS: Record<string, string> = {
  PREPAID: 'Оплата сразу',
  PAY_WITH_CREDIT: 'Кредит / рассрочка',
};

export const labelStatus = (code: string) => STATUS_LABELS[code] ?? code;

export interface ShareRow {
  key: string;
  label: string;
  orders: number;
  revenue: number;
  avgCheck: number | null;
  /** Доля в выручке, %. */
  sharePercent: number;
}

export interface StatusRow {
  status: string;
  label: string;
  count: number;
  sharePercent: number;
}

export interface PeriodRow {
  /** Начало периода, YYYY-MM-DD. */
  start: string;
  label: string;
  orders: number;
  revenue: number;
  avgCheck: number | null;
  /** Изменение выручки к предыдущему периоду, %. */
  changePercent: number | null;
}

export interface CancellationDay {
  date: string;
  total: number;
  cancelled: number;
  ratePercent: number | null;
}

export interface Breakdowns {
  statuses: StatusRow[];
  cities: ShareRow[];
  deliveryModes: ShareRow[];
  paymentModes: ShareRow[];
  express: ShareRow[];
  kaspiDelivery: ShareRow[];
  delivery: { cost: number; percentOfRevenue: number | null; expressOrders: number; kaspiDeliveryOrders: number };
  revenueByPeriod: { granularity: 'day' | 'week' | 'month'; rows: PeriodRow[] };
  cancellationsByDay: CancellationDay[];
  cancellationStatuses: StatusRow[];
  /** Среднее время от заказа до передачи курьеру Kaspi Доставки, часы. */
  avgProcessingHours: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, whole: number) => (whole === 0 ? null : round1((part / whole) * 100));

function orderRevenue(order: ReportOrder): number {
  return order.items.length > 0 ? order.items.reduce((s, i) => s + i.totalPrice, 0) : (order.totalPrice ?? 0);
}

function groupShares(orders: ReportOrder[], keyOf: (o: ReportOrder) => string, labelOf: (key: string) => string): ShareRow[] {
  const total = orders.reduce((s, o) => s + orderRevenue(o), 0);
  const groups = new Map<string, { orders: number; revenue: number }>();
  for (const order of orders) {
    const key = keyOf(order);
    const g = groups.get(key) ?? { orders: 0, revenue: 0 };
    g.orders++;
    g.revenue += orderRevenue(order);
    groups.set(key, g);
  }
  return [...groups]
    .map(([key, g]) => ({
      key,
      label: labelOf(key),
      orders: g.orders,
      revenue: g.revenue,
      avgCheck: g.orders ? Math.round(g.revenue / g.orders) : null,
      sharePercent: pct(g.revenue, total) ?? 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function statusRows(orders: ReportOrder[]): StatusRow[] {
  const counts = new Map<string, number>();
  for (const o of orders) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
  return [...counts]
    .map(([status, count]) => ({ status, label: labelStatus(status), count, sharePercent: pct(count, orders.length) ?? 0 }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Разрезы для вкладок аналитики. Продажи — выданные заказы; статусы и отмены
 * считаются по всем заказам периода.
 */
export function buildBreakdowns(
  orders: ReportOrder[],
  options: { from: Date; to: Date; timeZone?: string },
): Breakdowns {
  const timeZone = options.timeZone ?? 'Asia/Almaty';
  // Один форматтер на вызов: toLocaleDateString создаёт новый на каждую дату и медленный
  const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone });
  const dayOf = (d: Date) => dayFormat.format(d);
  const all = orders.filter((o) => o.createdAt >= options.from && o.createdAt <= options.to);
  const sold = all.filter((o) => isRealized(o.status));
  const revenue = sold.reduce((s, o) => s + orderRevenue(o), 0);

  // Выручка по периодам: дни для коротких периодов, недели и месяцы для длинных
  const spanDays = (options.to.getTime() - options.from.getTime()) / 86_400_000;
  const granularity = spanDays <= 31 ? 'day' : spanDays <= 120 ? 'week' : 'month';
  const periodStart = (d: Date): string => {
    const day = dayOf(d);
    if (granularity === 'day') return day;
    if (granularity === 'month') return `${day.slice(0, 7)}-01`;
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); // понедельник
    return date.toISOString().slice(0, 10);
  };
  const periodLabel = (start: string) => {
    const [y, m, d] = start.split('-');
    if (granularity === 'day') return `${d}.${m}`;
    if (granularity === 'week') return `с ${d}.${m}`;
    return `${m}.${y}`;
  };
  const periods = new Map<string, { orders: number; revenue: number }>();
  for (const o of sold) {
    const key = periodStart(o.createdAt);
    const p = periods.get(key) ?? { orders: 0, revenue: 0 };
    p.orders++;
    p.revenue += orderRevenue(o);
    periods.set(key, p);
  }
  const periodRows: PeriodRow[] = [...periods]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, p], index, list) => {
      const previous = index > 0 ? list[index - 1]![1].revenue : null;
      return {
        start,
        label: periodLabel(start),
        orders: p.orders,
        revenue: p.revenue,
        avgCheck: p.orders ? Math.round(p.revenue / p.orders) : null,
        changePercent: previous ? round1(((p.revenue - previous) / previous) * 100) : null,
      };
    });

  const cancelDays = new Map<string, { total: number; cancelled: number }>();
  for (const o of all) {
    const day = dayOf(o.createdAt);
    const c = cancelDays.get(day) ?? { total: 0, cancelled: 0 };
    c.total++;
    if (NOT_SOLD_STATUSES.has(o.status)) c.cancelled++;
    cancelDays.set(day, c);
  }

  const processed = sold.filter((o) => o.isKaspiDelivery && o.courierTransmissionDate);
  const processingHours = processed.map((o) => (o.courierTransmissionDate!.getTime() - o.createdAt.getTime()) / 3_600_000);

  const deliveryCost = sold.reduce((s, o) => s + o.deliveryCost, 0);
  return {
    statuses: statusRows(all),
    cities: groupShares(sold, (o) => o.city || 'Не указан', (k) => k).slice(0, 10),
    deliveryModes: groupShares(sold, (o) => o.deliveryMode || 'UNKNOWN', (k) => DELIVERY_LABELS[k] ?? (k === 'UNKNOWN' ? 'Не указан' : k)),
    paymentModes: groupShares(sold, (o) => o.paymentMode || 'UNKNOWN', (k) => PAYMENT_LABELS[k] ?? (k === 'UNKNOWN' ? 'Не указан' : k)),
    express: groupShares(sold, (o) => (o.express ? 'express' : 'regular'), (k) => (k === 'express' ? 'Экспресс' : 'Обычные')),
    kaspiDelivery: groupShares(
      sold,
      (o) => (o.isKaspiDelivery ? 'kaspi' : 'own'),
      (k) => (k === 'kaspi' ? 'Kaspi Доставка' : 'Своя доставка / самовывоз'),
    ),
    delivery: {
      cost: deliveryCost,
      percentOfRevenue: pct(deliveryCost, revenue),
      expressOrders: sold.filter((o) => o.express).length,
      kaspiDeliveryOrders: sold.filter((o) => o.isKaspiDelivery).length,
    },
    revenueByPeriod: { granularity, rows: periodRows },
    cancellationsByDay: [...cancelDays]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, c]) => ({ date, total: c.total, cancelled: c.cancelled, ratePercent: pct(c.cancelled, c.total) })),
    cancellationStatuses: statusRows(all.filter((o) => NOT_SOLD_STATUSES.has(o.status))),
    avgProcessingHours: processingHours.length
      ? round1(processingHours.reduce((s, h) => s + h, 0) / processingHours.length)
      : null,
  };
}
