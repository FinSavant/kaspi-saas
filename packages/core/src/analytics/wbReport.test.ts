import { describe, expect, it } from 'vitest';
import { buildWbBreakdowns, buildWbReport, type WbRow } from './wbReport';

const row = (overrides: Partial<WbRow>): WbRow => ({
  nmId: '111',
  saName: 'ART-1',
  title: 'Крем',
  docType: null,
  quantity: 0,
  retailAmount: 0,
  forPay: 0,
  delivery: 0,
  storage: 0,
  penalty: 0,
  acceptance: 0,
  deduction: 0,
  additionalPayment: 0,
  ...overrides,
});

describe('buildWbReport', () => {
  it('counts sales minus returns, WB fees, cost and tax', () => {
    const rows = [
      row({ docType: 'Продажа', quantity: 3, retailAmount: 3000, forPay: 2400 }),
      row({ docType: 'Возврат', quantity: 1, retailAmount: 1000, forPay: 800 }),
      row({ delivery: 150 }),
      row({ nmId: null, storage: 50 }),
      row({ penalty: 100 }),
    ];
    const { totals, byProduct } = buildWbReport(rows, new Map([['111', 400]]), 4);

    // Реализовано 3000 − 1000 = 2000; к перечислению 2400 − 800 = 1600; вознаграждение 400
    // К оплате 1600 − 150 − 50 − 100 = 1300; себестоимость 2 × 400 = 800; налог 4% от 2000 = 80
    expect(totals).toMatchObject({
      units: 2,
      returns: 1,
      revenue: 2000,
      commission: 400,
      payout: 1300,
      costOfGoods: 800,
      tax: 80,
      netProfit: 420,
      marginPercent: 21,
      costCoveragePercent: 100,
    });
    // Хранение без товара в строку товара не попадает
    expect(byProduct[0]).toMatchObject({ nmId: '111', units: 2, payout: 1350, costOfGoods: 800, netProfit: 470 });
  });

  it('leaves product profit empty without a cost price', () => {
    const { totals, byProduct } = buildWbReport([row({ docType: 'Продажа', quantity: 1, retailAmount: 500, forPay: 400 })], new Map());
    expect(byProduct[0]).toMatchObject({ costPrice: null, netProfit: null });
    expect(totals.costCoveragePercent).toBe(0);
  });

  it('separates charges of products without sales and charges without an article', () => {
    const rows = [
      row({ docType: 'Продажа', quantity: 1, retailAmount: 1000, forPay: 900 }),
      row({ delivery: 100 }),
      row({ nmId: '222', title: 'Шампунь', delivery: 300, penalty: 50 }),
      row({ nmId: null, storage: 70 }),
    ];
    const { totals, byProduct } = buildWbReport(rows, new Map([['111', 200]]));

    expect(byProduct.find((p) => p.nmId === '222')).toMatchObject({ hasSales: false, payout: -350 });
    // Продажи: 900 − 100 − 200 = 600; без продаж −350; склад −70; итого 180
    expect(totals).toMatchObject({ salesPayout: 800, salesProfit: 600, noSalesCharges: 350, generalCharges: 70, netProfit: 180 });
  });
});

describe('buildWbBreakdowns', () => {
  it('splits sales by day, logistics by warehouse and sales by method', () => {
    const base = { nmId: '1', saName: null, title: null, storage: 0, penalty: 0, acceptance: 0, deduction: 0, additionalPayment: 0, forPay: 0 };
    const { byDay, byWarehouse, bySaleMethod } = buildWbBreakdowns([
      { ...base, docType: 'Продажа', quantity: 0, retailAmount: 0, delivery: 186, saleDate: new Date('2026-10-06T09:00:00Z'), warehouse: 'Атакент', saleMethod: 'FBS, (МГТ)' },
      { ...base, docType: 'Продажа', quantity: 1, retailAmount: 1740, delivery: 0, saleDate: new Date('2026-10-06T09:00:00Z'), warehouse: 'Атакент', saleMethod: 'FBS, (МГТ)' },
      { ...base, docType: 'Возврат', quantity: 1, retailAmount: 500, delivery: 0, saleDate: new Date('2026-10-07T09:00:00Z'), warehouse: 'Коледино', saleMethod: 'FBW, (МГТ, короба)' },
    ]);
    expect(byDay).toEqual([{ date: '2026-10-06', units: 1, revenue: 1740 }, { date: '2026-10-07', units: -1, revenue: -500 }]);
    expect(byWarehouse[0]).toEqual({ warehouse: 'Атакент', delivery: 186, deliveries: 1, units: 1 });
    expect(bySaleMethod).toEqual([{ method: 'FBS', deliveries: 1, delivery: 186 }]);
  });
});
