import { abcAnalysis, type AbcClass } from './metrics';

/** Статусы Kaspi, при которых заказ не считается продажей. */
export const NOT_SOLD_STATUSES = new Set(['CANCELLED', 'CANCELLING', 'RETURNED', 'KASPI_DELIVERY_RETURN_REQUESTED']);

/** Продажа состоялась: заказ выдан покупателю. */
export const isRealized = (status: string) => status === 'COMPLETED';

/** Заказ ещё в работе (новый, упаковка, доставка, самовывоз) — деньги ожидаются. */
export const isInProgress = (status: string) => !isRealized(status) && !NOT_SOLD_STATUSES.has(status);

export interface ReportItem {
  sku: string;
  productId: string | null;
  name: string;
  categoryCode: string | null;
  categoryTitle: string | null;
  quantity: number;
  /** Сумма по позиции. */
  totalPrice: number;
  /** Себестоимость единицы; null — не указана. */
  unitCost: number | null;
}

export interface ReportOrder {
  createdAt: Date;
  status: string;
  /** Доставка, удержанная Kaspi с продавца. */
  deliveryCost: number;
  items: ReportItem[];
  // Поля для разрезов аналитики (buildBreakdowns)
  totalPrice?: number;
  city?: string | null;
  deliveryMode?: string | null;
  paymentMode?: string | null;
  isKaspiDelivery?: boolean;
  express?: boolean;
  courierTransmissionDate?: Date | null;
}

export interface CustomExpense {
  name: string;
  percent: number;
}

export interface ReportOptions {
  from: Date;
  to: Date;
  /** Комиссия Kaspi по коду категории без НДС, %; null — не задана. */
  commissionPercent: (categoryCode: string | null) => number | null;
  /** НДС, который Kaspi начисляет сверху на комиссию, %. */
  commissionVatPercent?: number;
  /** Комиссия Kaspi Pay от суммы продажи, %. */
  paymentFeePercent?: number;
  /** Налог продавца от выручки (упрощённая декларация), %. */
  taxPercent?: number;
  /** Свои расходы продавца от выручки (реклама, упаковка…), каждый — название и %. */
  customExpenses?: CustomExpense[];
  /** Какие заказы считать: выданные (по умолчанию) или ещё в работе. */
  include?: 'realized' | 'inProgress';
  timeZone?: string;
}

export interface ReportTotals {
  revenue: number;
  orders: number;
  units: number;
  avgCheck: number | null;
  /** Комиссия Kaspi Магазина без НДС (по категориям). */
  commission: number;
  /** НДС, начисленный Kaspi на комиссию. */
  commissionVat: number;
  /** Комиссия Kaspi Pay. */
  paymentFee: number;
  /** Налог продавца от выручки. */
  tax: number;
  /** Свои расходы продавца, всего и по статьям. */
  expenses: number;
  expenseLines: (CustomExpense & { amount: number })[];
  delivery: number;
  costOfGoods: number;
  netProfit: number;
  marginPercent: number | null;
  roiPercent: number | null;
  cancelled: number;
  /** Доля отменённых и возвращённых заказов, %. */
  cancelRatePercent: number | null;
  /** Доля выручки по товарам с указанной себестоимостью, %. */
  costCoveragePercent: number | null;
}

export interface ProductRow {
  sku: string;
  productId: string | null;
  name: string;
  units: number;
  revenue: number;
  avgPrice: number;
  /** null — у товара не указана себестоимость. */
  costOfGoods: number | null;
  /** Комиссия Kaspi Магазина вместе с НДС. */
  commission: number;
  paymentFee: number;
  tax: number;
  expenses: number;
  delivery: number;
  netProfit: number | null;
  marginPercent: number | null;
  /** Доля в выручке, %. */
  sharePercent: number;
  abc: AbcClass;
}

export interface DayRow {
  /** YYYY-MM-DD в часовом поясе отчёта. */
  date: string;
  revenue: number;
  netProfit: number;
  orders: number;
}

export interface SalesReport {
  totals: ReportTotals;
  byProduct: ProductRow[];
  byDay: DayRow[];
  missing: {
    /** Товары, проданные за период без указанной себестоимости. */
    productsWithoutCost: number;
    categoriesWithoutCommission: { code: string; title: string | null }[];
  };
}

const percent = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 10_000) / 100;

/**
 * Отчёт о продажах за период: итоги, товары и дни. По умолчанию считаются
 * только выданные заказы; с `include: 'inProgress'` — заказы в работе, то есть
 * нереализованная выручка и прибыль. Себестоимость без значения
 * считается нулём в итогах (прибыль завышена — см. `missing`), а у товара
 * прибыль тогда не считается.
 */
export function buildSalesReport(orders: ReportOrder[], options: ReportOptions): SalesReport {
  const timeZone = options.timeZone ?? 'Asia/Almaty';
  const vatPercent = options.commissionVatPercent ?? 0;
  const paymentFeePercent = options.paymentFeePercent ?? 0;
  const taxPercent = options.taxPercent ?? 0;
  const customExpenses = (options.customExpenses ?? []).filter((e) => e.percent > 0);
  // Один форматтер на вызов: toLocaleDateString создаёт новый на каждую дату и медленный
  const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone });
  const dayOf = (d: Date) => dayFormat.format(d);
  const inPeriod = orders.filter((o) => o.createdAt >= options.from && o.createdAt <= options.to);
  const counted = options.include === 'inProgress' ? isInProgress : isRealized;
  const sold = inPeriod.filter((o) => counted(o.status));
  const cancelledCount = inPeriod.filter((o) => NOT_SOLD_STATUSES.has(o.status)).length;

  const totals: ReportTotals = {
    revenue: 0,
    orders: sold.length,
    units: 0,
    avgCheck: null,
    commission: 0,
    commissionVat: 0,
    paymentFee: 0,
    tax: 0,
    expenses: 0,
    expenseLines: customExpenses.map((e) => ({ ...e, amount: 0 })),
    delivery: 0,
    costOfGoods: 0,
    netProfit: 0,
    marginPercent: null,
    roiPercent: null,
    cancelled: cancelledCount,
    cancelRatePercent: percent(cancelledCount, inPeriod.length),
    costCoveragePercent: null,
  };
  let revenueWithCost = 0;

  const products = new Map<string, Omit<ProductRow, 'avgPrice' | 'marginPercent' | 'sharePercent' | 'abc'> & { costKnown: boolean }>();
  const days = new Map<string, DayRow>();
  const missingCommission = new Map<string, string | null>();

  for (let t = new Date(dayOf(options.from)).getTime(); t <= new Date(dayOf(options.to)).getTime(); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    days.set(date, { date, revenue: 0, netProfit: 0, orders: 0 });
  }

  for (const order of sold) {
    const day = days.get(dayOf(order.createdAt))!;
    day.orders++;
    const orderRevenue = order.items.reduce((sum, item) => sum + item.totalPrice, 0);

    for (const item of order.items) {
      const pct = options.commissionPercent(item.categoryCode);
      if (pct === null && item.categoryCode) missingCommission.set(item.categoryCode, item.categoryTitle);
      const baseCommission = Math.round((item.totalPrice * (pct ?? 0)) / 100);
      const commissionVat = Math.round((baseCommission * vatPercent) / 100);
      // В строке товара комиссия показывается вместе с НДС
      const commission = baseCommission + commissionVat;
      const paymentFee = Math.round((item.totalPrice * paymentFeePercent) / 100);
      const tax = Math.round((item.totalPrice * taxPercent) / 100);
      let expenses = 0;
      customExpenses.forEach((e, i) => {
        const amount = Math.round((item.totalPrice * e.percent) / 100);
        totals.expenseLines[i]!.amount += amount;
        expenses += amount;
      });
      const delivery = orderRevenue > 0 ? Math.round((order.deliveryCost * item.totalPrice) / orderRevenue) : 0;
      const cost = item.unitCost === null ? null : item.unitCost * item.quantity;
      const profit = item.totalPrice - commission - paymentFee - tax - expenses - delivery - (cost ?? 0);

      totals.revenue += item.totalPrice;
      totals.units += item.quantity;
      totals.commission += baseCommission;
      totals.commissionVat += commissionVat;
      totals.paymentFee += paymentFee;
      totals.tax += tax;
      totals.expenses += expenses;
      totals.delivery += delivery;
      totals.costOfGoods += cost ?? 0;
      if (cost !== null) revenueWithCost += item.totalPrice;
      day.revenue += item.totalPrice;
      day.netProfit += profit;

      const row = products.get(item.sku) ?? {
        sku: item.sku,
        productId: item.productId,
        name: item.name,
        units: 0,
        revenue: 0,
        costOfGoods: 0,
        commission: 0,
        paymentFee: 0,
        tax: 0,
        expenses: 0,
        delivery: 0,
        netProfit: 0,
        costKnown: true,
      };
      row.units += item.quantity;
      row.revenue += item.totalPrice;
      row.commission += commission;
      row.paymentFee += paymentFee;
      row.tax += tax;
      row.expenses += expenses;
      row.delivery += delivery;
      if (cost === null) row.costKnown = false;
      else row.costOfGoods = (row.costOfGoods ?? 0) + cost;
      row.netProfit = (row.netProfit ?? 0) + profit;
      products.set(item.sku, row);
    }
  }

  totals.netProfit =
    totals.revenue - totals.commission - totals.commissionVat - totals.paymentFee - totals.tax - totals.expenses - totals.delivery - totals.costOfGoods;
  totals.avgCheck = totals.orders > 0 ? Math.round(totals.revenue / totals.orders) : null;
  totals.marginPercent = percent(totals.netProfit, totals.revenue);
  totals.roiPercent = percent(totals.netProfit, totals.costOfGoods);
  totals.costCoveragePercent = percent(revenueWithCost, totals.revenue);

  const abc = abcAnalysis([...products.values()].map((p) => ({ id: p.sku, revenue: p.revenue })));
  const byProduct: ProductRow[] = [...products.values()]
    .map(({ costKnown, ...p }) => ({
      ...p,
      avgPrice: p.units > 0 ? Math.round(p.revenue / p.units) : 0,
      costOfGoods: costKnown ? p.costOfGoods : null,
      netProfit: costKnown ? p.netProfit : null,
      marginPercent: costKnown ? percent(p.netProfit ?? 0, p.revenue) : null,
      sharePercent: percent(p.revenue, totals.revenue) ?? 0,
      abc: abc.get(p.sku) ?? 'C',
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    totals,
    byProduct,
    byDay: [...days.values()],
    missing: {
      productsWithoutCost: byProduct.filter((p) => p.costOfGoods === null).length,
      categoriesWithoutCommission: [...missingCommission].map(([code, title]) => ({ code, title })),
    },
  };
}

export const MAX_CUSTOM_EXPENSES = 4;

/** Свои расходы из настроек магазина (Json в базе); мусор и пустые строки отбрасываются. */
export function parseCustomExpenses(value: unknown): CustomExpense[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is CustomExpense => !!e && typeof e.name === 'string' && typeof e.percent === 'number' && Number.isFinite(e.percent))
    .map((e) => ({ name: e.name.trim().slice(0, 40), percent: e.percent }))
    .filter((e) => e.name && e.percent > 0 && e.percent <= 100)
    .slice(0, MAX_CUSTOM_EXPENSES);
}

/** Сумма процентов своих расходов — для минимальной выгодной цены робота. */
export const customExpensesPercent = (expenses: CustomExpense[]) => expenses.reduce((sum, e) => sum + e.percent, 0);
