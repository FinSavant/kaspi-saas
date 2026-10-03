import { describe, expect, it } from 'vitest';
import { buildBreakdowns } from './breakdowns';
import type { ReportOrder } from './salesReport';

const order = (createdAt: string, overrides: Partial<ReportOrder> = {}): ReportOrder => ({
  createdAt: new Date(createdAt),
  status: 'COMPLETED',
  deliveryCost: 500,
  items: [],
  totalPrice: 10_000,
  city: 'Алматы',
  deliveryMode: 'DELIVERY_PICKUP',
  paymentMode: 'PREPAID',
  isKaspiDelivery: true,
  express: false,
  courierTransmissionDate: null,
  ...overrides,
});

const week = { from: new Date('2026-09-01T00:00:00+05:00'), to: new Date('2026-09-07T23:59:59+05:00') };

describe('buildBreakdowns', () => {
  it('counts every status but builds sales only from sold orders', () => {
    const b = buildBreakdowns(
      [order('2026-09-02T10:00:00+05:00'), order('2026-09-02T11:00:00+05:00', { status: 'CANCELLED' })],
      week,
    );
    expect(b.statuses.map((s) => [s.label, s.count, s.sharePercent])).toEqual([
      ['Выдан', 1, 50],
      ['Отменён', 1, 50],
    ]);
    expect(b.cities).toEqual([{ key: 'Алматы', label: 'Алматы', orders: 1, revenue: 10_000, avgCheck: 10_000, sharePercent: 100 }]);
  });

  it('splits by city, delivery, payment, express and Kaspi Delivery', () => {
    const b = buildBreakdowns(
      [
        order('2026-09-02T10:00:00+05:00', { totalPrice: 6_000 }),
        order('2026-09-03T10:00:00+05:00', {
          totalPrice: 4_000,
          city: 'Астана',
          deliveryMode: 'DELIVERY_REGIONAL_TODOOR',
          paymentMode: 'PAY_WITH_CREDIT',
          express: true,
          isKaspiDelivery: false,
        }),
      ],
      week,
    );
    expect(b.cities.map((c) => [c.label, c.sharePercent])).toEqual([
      ['Алматы', 60],
      ['Астана', 40],
    ]);
    expect(b.deliveryModes.map((d) => d.label)).toEqual(['Пункт выдачи / постамат', 'Курьер в другой город']);
    expect(b.paymentModes.map((d) => d.label)).toEqual(['Оплата сразу', 'Кредит / рассрочка']);
    expect(b.express.map((d) => [d.label, d.orders])).toEqual([
      ['Обычные', 1],
      ['Экспресс', 1],
    ]);
    expect(b.kaspiDelivery.map((d) => d.label)).toEqual(['Kaspi Доставка', 'Своя доставка / самовывоз']);
    expect(b.delivery).toEqual({ cost: 1_000, percentOfRevenue: 10, expressOrders: 1, kaspiDeliveryOrders: 1 });
  });

  it('groups revenue by day for short periods with change to the previous day', () => {
    const b = buildBreakdowns(
      [order('2026-09-02T10:00:00+05:00'), order('2026-09-03T10:00:00+05:00'), order('2026-09-03T12:00:00+05:00')],
      week,
    );
    expect(b.revenueByPeriod.granularity).toBe('day');
    expect(b.revenueByPeriod.rows).toEqual([
      { start: '2026-09-02', label: '02.09', orders: 1, revenue: 10_000, avgCheck: 10_000, changePercent: null },
      { start: '2026-09-03', label: '03.09', orders: 2, revenue: 20_000, avgCheck: 10_000, changePercent: 100 },
    ]);
  });

  it('groups by week from Monday for periods up to 4 months', () => {
    const b = buildBreakdowns([order('2026-09-02T10:00:00+05:00'), order('2026-09-06T10:00:00+05:00')], {
      from: new Date('2026-07-01T00:00:00+05:00'),
      to: new Date('2026-09-30T00:00:00+05:00'),
    });
    expect(b.revenueByPeriod.granularity).toBe('week');
    expect(b.revenueByPeriod.rows).toHaveLength(1);
    expect(b.revenueByPeriod.rows[0]!.start).toBe('2026-08-31');
  });

  it('tracks the cancellation trend and average processing time', () => {
    const b = buildBreakdowns(
      [
        order('2026-09-02T10:00:00+05:00', { courierTransmissionDate: new Date('2026-09-03T10:00:00+05:00') }),
        order('2026-09-02T12:00:00+05:00', { courierTransmissionDate: new Date('2026-09-02T22:00:00+05:00') }),
        order('2026-09-02T13:00:00+05:00', { status: 'RETURNED' }),
      ],
      week,
    );
    expect(b.cancellationsByDay).toEqual([{ date: '2026-09-02', total: 3, cancelled: 1, ratePercent: 33.3 }]);
    expect(b.cancellationStatuses.map((s) => s.label)).toEqual(['Возвращён']);
    expect(b.avgProcessingHours).toBe(17);
  });
});
