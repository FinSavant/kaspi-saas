import { describe, expect, it } from 'vitest';
import { abcAnalysis, calculateOrderProfit, summarizeOrders, xyzAnalysis } from './metrics';

describe('calculateOrderProfit', () => {
  it('subtracts commission, delivery and cost of goods', () => {
    const p = calculateOrderProfit({ revenue: 10_000, commissionPercent: 12, deliveryCost: 800, costOfGoods: 6_000 });
    expect(p.commission).toBe(1_200);
    expect(p.netProfit).toBe(2_000);
    expect(p.marginPercent).toBe(20);
    expect(p.roiPercent).toBe(33.33);
  });

  it('returns null ratios when the denominators are zero', () => {
    const p = calculateOrderProfit({ revenue: 0, commissionPercent: 12, deliveryCost: 0, costOfGoods: 0 });
    expect(p.marginPercent).toBeNull();
    expect(p.roiPercent).toBeNull();
  });
});

describe('summarizeOrders', () => {
  it('adds up orders with different commission rates', () => {
    const s = summarizeOrders([
      { revenue: 10_000, commissionPercent: 10, deliveryCost: 500, costOfGoods: 5_000 },
      { revenue: 20_000, commissionPercent: 15, deliveryCost: 1_000, costOfGoods: 12_000 },
    ]);
    expect(s.revenue).toBe(30_000);
    expect(s.commission).toBe(4_000);
    expect(s.netProfit).toBe(7_500);
    expect(s.marginPercent).toBe(25);
  });
});

describe('abcAnalysis', () => {
  it('classifies by cumulative revenue share', () => {
    const classes = abcAnalysis([
      { id: 'big', revenue: 7_000 },
      { id: 'mid', revenue: 1_500 },
      { id: 'small', revenue: 1_000 },
      { id: 'tiny', revenue: 500 },
      { id: 'none', revenue: 0 },
    ]);
    expect(Object.fromEntries(classes)).toEqual({ big: 'A', mid: 'A', small: 'B', tiny: 'C', none: 'C' });
  });

  it('puts everything in C when there is no revenue', () => {
    expect(abcAnalysis([{ id: 'a', revenue: 0 }]).get('a')).toBe('C');
  });
});

describe('xyzAnalysis', () => {
  it('classifies by demand stability', () => {
    const classes = xyzAnalysis([
      { id: 'stable', unitsByPeriod: [10, 10, 11, 10] },
      { id: 'wavy', unitsByPeriod: [10, 13, 8, 12] },
      { id: 'erratic', unitsByPeriod: [0, 30, 1, 0] },
      { id: 'dead', unitsByPeriod: [0, 0, 0] },
    ]);
    expect(Object.fromEntries(classes)).toEqual({ stable: 'X', wavy: 'Y', erratic: 'Z', dead: 'Z' });
  });
});
