import { describe, expect, it } from 'vitest';
import { selectWaybillOrders, type WaybillCandidate } from './selectOrders';

const order = (code: string, overrides: Partial<WaybillCandidate> = {}): WaybillCandidate => ({
  code,
  city: 'Алматы',
  express: false,
  createdAt: new Date('2026-10-02T10:00:00+05:00'),
  items: [{ sku: 'A', name: 'Антисептик' }],
  ...overrides,
});

const orders = [
  order('1', { items: [{ sku: 'V', name: 'Вазелин' }], city: 'Шымкент' }),
  order('2', { items: [{ sku: 'A', name: 'Антисептик' }], city: 'Шымкент', express: true }),
  order('3', { items: [{ sku: 'A', name: 'Антисептик' }], city: 'Астана', createdAt: new Date('2026-09-25T10:00:00+05:00') }),
  order('4', { items: [{ sku: 'V', name: 'Вазелин' }], city: 'Алматы' }),
];

describe('selectWaybillOrders', () => {
  it('keeps everything in the original order without filters', () => {
    expect(selectWaybillOrders(orders, {}).map((o) => o.code)).toEqual(['1', '2', '3', '4']);
  });

  it('sorts by product name, then by city', () => {
    expect(selectWaybillOrders(orders, { sort: 'product' }).map((o) => o.code)).toEqual(['2', '3', '1', '4']);
    expect(selectWaybillOrders(orders, { sort: 'product_city' }).map((o) => o.code)).toEqual(['3', '2', '4', '1']);
  });

  it('filters by express, period, city, product and order code', () => {
    expect(selectWaybillOrders(orders, { excludeExpress: true }).map((o) => o.code)).toEqual(['1', '3', '4']);
    expect(selectWaybillOrders(orders, { createdFrom: '2026-10-01T00:00:00+05:00' }).map((o) => o.code)).toEqual(['1', '2', '4']);
    expect(selectWaybillOrders(orders, { cities: ['Шымкент'] }).map((o) => o.code)).toEqual(['1', '2']);
    expect(selectWaybillOrders(orders, { skus: ['V'] }).map((o) => o.code)).toEqual(['1', '4']);
    expect(selectWaybillOrders(orders, { orderCodes: ['3'] }).map((o) => o.code)).toEqual(['3']);
  });

  it('treats empty filter lists as «all»', () => {
    expect(selectWaybillOrders(orders, { cities: [], skus: [], orderCodes: [] })).toHaveLength(4);
  });
});
