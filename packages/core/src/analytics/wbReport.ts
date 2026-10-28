/** Строка отчёта о реализации WB — то, что нужно для расчёта (суммы в валюте отчёта). */
export interface WbRow {
  nmId: string | null;
  saName: string | null;
  title: string | null;
  docType: string | null;
  quantity: number;
  retailAmount: number;
  forPay: number;
  delivery: number;
  storage: number;
  penalty: number;
  acceptance: number;
  deduction: number;
  additionalPayment: number;
}

export interface WbTotals {
  /** Продано штук за вычетом возвратов. */
  units: number;
  returns: number;
  /** Реализовано: сумма продаж покупателям за вычетом возвратов. */
  revenue: number;
  /** Вознаграждение WB: реализовано − к перечислению за товар. */
  commission: number;
  /** К перечислению за товар (до логистики, хранения и штрафов). */
  forPay: number;
  delivery: number;
  storage: number;
  penalty: number;
  acceptance: number;
  deduction: number;
  additionalPayment: number;
  /** Итого к оплате от WB. */
  payout: number;
  costOfGoods: number;
  tax: number;
  netProfit: number;
  marginPercent: number | null;
  /** Доля реализованного по товарам с себестоимостью, %. */
  costCoveragePercent: number | null;
  /** К оплате по товарам, которые продавались в отчёте (с их логистикой и удержаниями). */
  salesPayout: number;
  /** Прибыль по товарам с продажами: их «к оплате» − себестоимость − налог. */
  salesProfit: number;
  /** Расходы по товарам без продаж в отчёте: логистика возвратов и отмен, приёмка, штрафы. */
  noSalesCharges: number;
  /** Расходы без артикула: хранение и перевозка по складу в целом. */
  generalCharges: number;
}

export interface WbProductRow {
  nmId: string;
  /** Продавался ли товар в отчёте; без продаж у товара только расходы (логистика возвратов и т. п.). */
  hasSales: boolean;
  saName: string | null;
  title: string | null;
  units: number;
  returns: number;
  revenue: number;
  commission: number;
  delivery: number;
  /** Штрафы, удержания и прочее по товару. */
  other: number;
  payout: number;
  costPrice: number | null;
  costOfGoods: number | null;
  netProfit: number | null;
  marginPercent: number | null;
}

const SALE = 'Продажа';
const RETURN = 'Возврат';
const round = (v: number) => Math.round(v * 100) / 100;
const percent = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 10_000) / 100);

/**
 * Итоги WB по строкам отчёта о реализации: продажи и возвраты — по типу документа,
 * логистика, хранение, штрафы и удержания — по всем строкам. Себестоимость — по проданным
 * за вычетом возвратов; налог — процент от реализованного.
 */
export function buildWbReport(rows: WbRow[], costByNm: Map<string, number>, taxPercent = 0): { totals: WbTotals; byProduct: WbProductRow[] } {
  const zero = () => ({ units: 0, returns: 0, revenue: 0, forPay: 0, delivery: 0, storage: 0, penalty: 0, acceptance: 0, deduction: 0, additionalPayment: 0 });
  const totals = zero();
  const products = new Map<string, ReturnType<typeof zero> & { saName: string | null; title: string | null }>();

  for (const row of rows) {
    const sign = row.docType === SALE ? 1 : row.docType === RETURN ? -1 : 0;
    const add = (t: ReturnType<typeof zero>) => {
      if (sign === 1) t.units += row.quantity;
      if (sign === -1) t.returns += row.quantity;
      t.revenue += sign * row.retailAmount;
      t.forPay += sign * row.forPay;
      t.delivery += row.delivery;
      t.storage += row.storage;
      t.penalty += row.penalty;
      t.acceptance += row.acceptance;
      t.deduction += row.deduction;
      t.additionalPayment += row.additionalPayment;
    };
    add(totals);
    if (row.nmId) {
      const p = products.get(row.nmId) ?? { ...zero(), saName: row.saName, title: row.title };
      p.saName ??= row.saName;
      p.title ??= row.title;
      add(p);
      products.set(row.nmId, p);
    }
  }

  const payoutOf = (t: ReturnType<typeof zero>) =>
    t.forPay - t.delivery - t.storage - t.penalty - t.acceptance - t.deduction + t.additionalPayment;

  let costOfGoods = 0;
  let revenueWithCost = 0;
  const byProduct: WbProductRow[] = [...products.entries()]
    .map(([nmId, p]) => {
      const costPrice = costByNm.get(nmId) ?? null;
      const net = p.units - p.returns;
      const cost = costPrice === null ? null : costPrice * net;
      if (cost !== null) {
        costOfGoods += cost;
        revenueWithCost += p.revenue;
      }
      const payout = payoutOf(p);
      const tax = (p.revenue * taxPercent) / 100;
      const profit = cost === null ? null : payout - cost - tax;
      return {
        nmId,
        hasSales: p.units > 0,
        saName: p.saName,
        title: p.title,
        units: net,
        returns: p.returns,
        revenue: round(p.revenue),
        commission: round(p.revenue - p.forPay),
        delivery: round(p.delivery),
        other: round(p.storage + p.penalty + p.acceptance + p.deduction - p.additionalPayment),
        payout: round(payout),
        costPrice,
        costOfGoods: cost === null ? null : round(cost),
        netProfit: profit === null ? null : round(profit),
        marginPercent: profit === null ? null : percent(profit, p.revenue),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const payout = payoutOf(totals);
  const tax = (totals.revenue * taxPercent) / 100;
  const netProfit = payout - costOfGoods - tax;
  // Расходы без продаж — отдельно: видно, что продажи в плюсе, а минус дали удержания WB
  const payoutSum = (list: WbProductRow[]) => list.reduce((s, p) => s + p.payout, 0);
  const salesPayout = payoutSum(byProduct.filter((p) => p.hasSales));
  const noSalesCharges = -payoutSum(byProduct.filter((p) => !p.hasSales));
  const generalCharges = payoutSum(byProduct) - payout;
  return {
    totals: {
      units: totals.units - totals.returns,
      returns: totals.returns,
      revenue: round(totals.revenue),
      commission: round(totals.revenue - totals.forPay),
      forPay: round(totals.forPay),
      delivery: round(totals.delivery),
      storage: round(totals.storage),
      penalty: round(totals.penalty),
      acceptance: round(totals.acceptance),
      deduction: round(totals.deduction),
      additionalPayment: round(totals.additionalPayment),
      payout: round(payout),
      costOfGoods: round(costOfGoods),
      tax: round(tax),
      netProfit: round(netProfit),
      marginPercent: percent(netProfit, totals.revenue),
      costCoveragePercent: percent(revenueWithCost, totals.revenue),
      salesPayout: round(salesPayout),
      salesProfit: round(salesPayout - costOfGoods - tax),
      noSalesCharges: round(noSalesCharges),
      generalCharges: round(generalCharges),
    },
    byProduct,
  };
}

export interface WbBreakdownRow extends WbRow {
  saleDate: Date | null;
  warehouse: string | null;
  saleMethod: string | null;
}

export interface WbBreakdowns {
  /** По дням продажи (по Алматы): продажи и реализовано. */
  byDay: { date: string; units: number; revenue: number }[];
  /** Логистика по складам: сумма и число доставок. */
  byWarehouse: { warehouse: string; delivery: number; deliveries: number; units: number }[];
  /** Схема FBS / FBW: доставки и логистика (схема в отчёте WB указана у строк логистики). */
  bySaleMethod: { method: string; deliveries: number; delivery: number }[];
}

/** Разбивки для отчёта: дни, склады, способы продажи. */
export function buildWbBreakdowns(rows: WbBreakdownRow[], timeZone = 'Asia/Almaty'): WbBreakdowns {
  const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone });
  const days = new Map<string, { units: number; revenue: number }>();
  const warehouses = new Map<string, { delivery: number; deliveries: number; units: number }>();
  const methods = new Map<string, { deliveries: number; delivery: number }>();
  for (const row of rows) {
    const sign = row.docType === SALE ? 1 : row.docType === RETURN ? -1 : 0;
    // Строка продажи или возврата товара; у строк логистики тип документа тоже «Продажа», но кол-во 0
    const sold = sign !== 0 && row.quantity !== 0;
    const whName = row.warehouse ?? 'Склад не указан';
    const wh = warehouses.get(whName) ?? { delivery: 0, deliveries: 0, units: 0 };
    wh.delivery += row.delivery;
    if (row.delivery > 0) wh.deliveries++;
    if (sold) wh.units += sign * row.quantity;
    warehouses.set(whName, wh);
    if (row.delivery !== 0 && row.saleMethod) {
      const method = row.saleMethod.split(',')[0]!.trim();
      const m = methods.get(method) ?? { deliveries: 0, delivery: 0 };
      if (row.delivery > 0) m.deliveries++;
      m.delivery += row.delivery;
      methods.set(method, m);
    }
    if (!sold) continue;
    if (row.saleDate) {
      const key = dayFormat.format(row.saleDate);
      const d = days.get(key) ?? { units: 0, revenue: 0 };
      d.units += sign * row.quantity;
      d.revenue += sign * row.retailAmount;
      days.set(key, d);
    }
  }
  return {
    byDay: [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, units: d.units, revenue: round(d.revenue) })),
    byWarehouse: [...warehouses.entries()]
      .filter(([, w]) => w.delivery !== 0 || w.units !== 0)
      .map(([warehouse, w]) => ({ warehouse, delivery: round(w.delivery), deliveries: w.deliveries, units: w.units }))
      .sort((a, b) => b.delivery - a.delivery),
    bySaleMethod: [...methods.entries()].map(([method, m]) => ({ method, deliveries: m.deliveries, delivery: round(m.delivery) })).sort((a, b) => b.delivery - a.delivery),
  };
}
