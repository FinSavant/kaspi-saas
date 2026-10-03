export interface OrderFinancials {
  /** Сумма заказа в тенге. */
  revenue: number;
  /** Комиссия Kaspi в процентах (зависит от категории). */
  commissionPercent: number;
  deliveryCost: number;
  /** Себестоимость проданных товаров. */
  costOfGoods: number;
}

export interface ProfitBreakdown {
  revenue: number;
  commission: number;
  deliveryCost: number;
  costOfGoods: number;
  netProfit: number;
  /** Чистая прибыль к выручке, %. null при нулевой выручке. */
  marginPercent: number | null;
  /** Чистая прибыль к себестоимости, %. null при нулевой себестоимости. */
  roiPercent: number | null;
}

const percent = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 10_000) / 100;

export function calculateOrderProfit(order: OrderFinancials): ProfitBreakdown {
  const commission = Math.round((order.revenue * order.commissionPercent) / 100);
  return withRatios({
    revenue: order.revenue,
    commission,
    deliveryCost: order.deliveryCost,
    costOfGoods: order.costOfGoods,
  });
}

export function summarizeOrders(orders: OrderFinancials[]): ProfitBreakdown {
  const totals = { revenue: 0, commission: 0, deliveryCost: 0, costOfGoods: 0 };
  for (const order of orders) {
    const profit = calculateOrderProfit(order);
    totals.revenue += profit.revenue;
    totals.commission += profit.commission;
    totals.deliveryCost += profit.deliveryCost;
    totals.costOfGoods += profit.costOfGoods;
  }
  return withRatios(totals);
}

function withRatios(t: Pick<ProfitBreakdown, 'revenue' | 'commission' | 'deliveryCost' | 'costOfGoods'>): ProfitBreakdown {
  const netProfit = t.revenue - t.commission - t.deliveryCost - t.costOfGoods;
  return {
    ...t,
    netProfit,
    marginPercent: percent(netProfit, t.revenue),
    roiPercent: percent(netProfit, t.costOfGoods),
  };
}

export type AbcClass = 'A' | 'B' | 'C';
export type XyzClass = 'X' | 'Y' | 'Z';

/**
 * ABC по доле выручки: товары, с которых начинаются первые 80% выручки, — A,
 * следующие 15% — B, остальные — C.
 */
export function abcAnalysis(items: { id: string; revenue: number }[]): Map<string, AbcClass> {
  const result = new Map<string, AbcClass>();
  const total = items.reduce((sum, item) => sum + item.revenue, 0);
  let cumulative = 0;

  for (const item of [...items].sort((a, b) => b.revenue - a.revenue)) {
    const shareBefore = total === 0 ? 1 : cumulative / total;
    result.set(item.id, item.revenue <= 0 ? 'C' : shareBefore < 0.8 ? 'A' : shareBefore < 0.95 ? 'B' : 'C');
    cumulative += item.revenue;
  }
  return result;
}

/**
 * XYZ по стабильности спроса: коэффициент вариации продаж по периодам
 * до 10% — X, до 25% — Y, выше или без продаж — Z.
 */
export function xyzAnalysis(items: { id: string; unitsByPeriod: number[] }[]): Map<string, XyzClass> {
  const result = new Map<string, XyzClass>();

  for (const item of items) {
    const n = item.unitsByPeriod.length;
    const mean = n === 0 ? 0 : item.unitsByPeriod.reduce((s, v) => s + v, 0) / n;
    if (mean === 0) {
      result.set(item.id, 'Z');
      continue;
    }
    const variance = item.unitsByPeriod.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const cv = Math.sqrt(variance) / mean;
    result.set(item.id, cv <= 0.1 ? 'X' : cv <= 0.25 ? 'Y' : 'Z');
  }
  return result;
}
