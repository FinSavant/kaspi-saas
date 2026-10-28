import { describe, expect, it } from 'vitest';
import { buildSalesReport, type ReportItem, type ReportOrder } from './salesReport';

const item = (overrides: Partial<ReportItem> = {}): ReportItem => ({
  sku: 'A',
  productId: 'p-a',
  name: 'Товар A',
  categoryCode: 'Hair',
  categoryTitle: 'Уход за волосами',
  quantity: 1,
  totalPrice: 10_000,
  unitCost: 6_000,
  ...overrides,
});

const order = (createdAt: string, items: ReportItem[], overrides: Partial<ReportOrder> = {}): ReportOrder => ({
  createdAt: new Date(createdAt),
  status: 'COMPLETED',
  deliveryCost: 0,
  items,
  ...overrides,
});

const options = {
  from: new Date('2026-09-01T00:00:00+05:00'),
  to: new Date('2026-09-07T23:59:59+05:00'),
  commissionPercent: (code: string | null) => (code === 'Hair' ? 12 : null),
};

describe('buildSalesReport', () => {
  it('subtracts commission, seller delivery and cost of goods', () => {
    const report = buildSalesReport([order('2026-09-02T10:00:00+05:00', [item()], { deliveryCost: 900 })], options);

    expect(report.totals).toMatchObject({
      revenue: 10_000,
      orders: 1,
      units: 1,
      avgCheck: 10_000,
      commission: 1_200,
      delivery: 900,
      costOfGoods: 6_000,
      netProfit: 1_900,
      marginPercent: 19,
      roiPercent: 31.67,
    });
  });

  it('takes the seller tax from the sale amount, not from what is left after deductions', () => {
    const report = buildSalesReport([order('2026-09-02T10:00:00+05:00', [item()], { deliveryCost: 900 })], {
      ...options,
      taxPercent: 4,
    });

    // 10 000 × 4% = 400 — от всей суммы продажи; прибыль 1 900 − 400 = 1 500
    expect(report.totals).toMatchObject({ revenue: 10_000, tax: 400, netProfit: 1_500 });
    expect(report.byProduct[0]).toMatchObject({ tax: 400, netProfit: 1_500 });
  });

  it('deducts the seller own expenses as percents of the sale amount', () => {
    const report = buildSalesReport([order('2026-09-02T10:00:00+05:00', [item()], { deliveryCost: 900 })], {
      ...options,
      customExpenses: [
        { name: 'Реклама', percent: 5 },
        { name: 'Упаковка', percent: 1.5 },
        { name: 'Пусто', percent: 0 },
      ],
    });

    // 10 000 × 5% = 500, × 1,5% = 150; прибыль 1 900 − 650 = 1 250
    expect(report.totals).toMatchObject({ expenses: 650, netProfit: 1_250 });
    expect(report.totals.expenseLines).toEqual([
      { name: 'Реклама', percent: 5, amount: 500 },
      { name: 'Упаковка', percent: 1.5, amount: 150 },
    ]);
    expect(report.byProduct[0]).toMatchObject({ expenses: 650, netProfit: 1_250 });
  });

  it('adds VAT on top of the Kaspi commission and deducts the Kaspi Pay fee', () => {
    const report = buildSalesReport([order('2026-09-02T10:00:00+05:00', [item()], { deliveryCost: 900 })], {
      ...options,
      commissionPercent: () => 10.9,
      commissionVatPercent: 16,
      paymentFeePercent: 0.95,
    });

    // 10 000 × 10,9% = 1 090; НДС 16% = 174; 10 000 × 0,95% = 95
    expect(report.totals).toMatchObject({
      commission: 1_090,
      commissionVat: 174,
      paymentFee: 95,
      netProfit: 10_000 - 1_090 - 174 - 95 - 900 - 6_000,
    });
    expect(report.byProduct[0]).toMatchObject({ commission: 1_264, paymentFee: 95, netProfit: 1_741 });
  });

  it('reproduces the WaybillPrint expense breakdown', () => {
    // Цифры со скриншота WaybillPrint: выручка 1 196 342 ₸ по категории 10,9%
    const report = buildSalesReport([order('2026-09-02T10:00:00+05:00', [item({ totalPrice: 1_196_342, unitCost: 298_802 })], { deliveryCost: 105_258 })], {
      ...options,
      commissionPercent: () => 10.9,
      commissionVatPercent: 16,
      paymentFeePercent: 0.95,
    });

    expect(report.totals).toMatchObject({
      commission: 130_401,
      commissionVat: 20_864,
      paymentFee: 11_365,
      delivery: 105_258,
      costOfGoods: 298_802,
      netProfit: 629_652,
    });
  });

  it('splits order delivery between items by their revenue', () => {
    const report = buildSalesReport(
      [
        order(
          '2026-09-02T10:00:00+05:00',
          [item({ totalPrice: 3_000, unitCost: 1_000 }), item({ sku: 'B', name: 'Товар B', totalPrice: 1_000, unitCost: 500 })],
          { deliveryCost: 800 },
        ),
      ],
      options,
    );

    expect(report.byProduct.map((p) => [p.sku, p.delivery])).toEqual([
      ['A', 600],
      ['B', 200],
    ]);
  });

  const mixed = [
    order('2026-09-02T10:00:00+05:00', [item()]),
    order('2026-09-03T10:00:00+05:00', [item()], { status: 'CANCELLED' }),
    order('2026-09-04T10:00:00+05:00', [item()], { status: 'RETURNED' }),
    order('2026-09-05T10:00:00+05:00', [item({ totalPrice: 4_000, unitCost: 1_000 })], { status: 'ACCEPTED_BY_MERCHANT' }),
  ];

  it('counts only delivered orders as sales and still counts cancellations', () => {
    const report = buildSalesReport(mixed, options);

    expect(report.totals.orders).toBe(1);
    expect(report.totals.revenue).toBe(10_000);
    expect(report.totals.cancelled).toBe(2);
    expect(report.totals.cancelRatePercent).toBe(50);
  });

  it('reports orders still in progress as unrealized revenue and profit', () => {
    const report = buildSalesReport(mixed, { ...options, include: 'inProgress' });

    expect(report.totals.orders).toBe(1);
    expect(report.totals.revenue).toBe(4_000);
    // 4 000 − 12% комиссии (480) − себестоимость 1 000
    expect(report.totals.netProfit).toBe(2_520);
  });

  it('ignores orders outside the period', () => {
    const report = buildSalesReport([order('2026-08-31T23:00:00+05:00', [item()]), order('2026-09-08T00:30:00+05:00', [item()])], options);
    expect(report.totals.orders).toBe(0);
  });

  it('flags products without cost and categories without commission', () => {
    const report = buildSalesReport(
      [order('2026-09-02T10:00:00+05:00', [item({ unitCost: null }), item({ sku: 'B', categoryCode: 'Socks', categoryTitle: 'Носки' })])],
      options,
    );

    const a = report.byProduct.find((p) => p.sku === 'A')!;
    expect(a.costOfGoods).toBeNull();
    expect(report.totals.costCoveragePercent).toBe(50);
    expect(a.netProfit).toBeNull();
    expect(report.missing).toEqual({
      productsWithoutCost: 1,
      categoriesWithoutCommission: [{ code: 'Socks', title: 'Носки' }],
    });
  });

  it('aggregates products, shares and ABC classes', () => {
    const report = buildSalesReport(
      [
        order('2026-09-02T10:00:00+05:00', [item({ quantity: 2, totalPrice: 16_000 })]),
        order('2026-09-03T10:00:00+05:00', [item({ quantity: 1, totalPrice: 8_000 })]),
        order('2026-09-03T11:00:00+05:00', [item({ sku: 'B', name: 'Товар B', totalPrice: 1_000, unitCost: 300 })]),
      ],
      options,
    );

    expect(report.byProduct[0]).toMatchObject({ sku: 'A', units: 3, revenue: 24_000, avgPrice: 8_000, sharePercent: 96, abc: 'A' });
    expect(report.byProduct[1]).toMatchObject({ sku: 'B', sharePercent: 4, abc: 'C' });
  });

  it('groups by day in the Almaty time zone and fills empty days', () => {
    const report = buildSalesReport(
      [order('2026-09-02T20:30:00Z', [item()])], // 3 сентября, 01:30 по Алматы
      options,
    );

    expect(report.byDay).toHaveLength(7);
    expect(report.byDay.find((d) => d.date === '2026-09-03')).toMatchObject({ revenue: 10_000, orders: 1 });
    expect(report.byDay.find((d) => d.date === '2026-09-02')).toMatchObject({ revenue: 0, orders: 0 });
  });
});
