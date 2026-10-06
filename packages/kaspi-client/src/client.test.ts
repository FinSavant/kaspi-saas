import { describe, expect, it, vi } from 'vitest';
import { isAwaitingHandover, KaspiClient, type KaspiOrder } from './client';

const order = (overrides: Partial<KaspiOrder> = {}): KaspiOrder => ({
  id: '1',
  code: '100',
  state: 'KASPI_DELIVERY',
  status: 'ACCEPTED_BY_MERCHANT',
  totalPrice: 5_000,
  deliveryCost: 0,
  deliveryCostForSeller: 0,
  city: null,
  waybillUrl: 'https://kaspi.kz/waybill/1',
  assembled: true,
  courierTransmissionDate: null,
  createdAt: new Date(),
  completedAt: null,
  deliveryMode: 'DELIVERY_PICKUP',
  paymentMode: 'PREPAID',
  isKaspiDelivery: true,
  express: false,
  customerName: null,
  plannedDeliveryDate: null,
  ...overrides,
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('KaspiClient date ranges and entries', () => {
  it('splits a long period into 14-day requests, as Kaspi allows no wider filter', async () => {
    const spy = vi.fn<typeof fetch>(async () => json({ data: [] }));
    const client = new KaspiClient('token', 'https://example.test', spy);
    const to = new Date('2026-10-01T00:00:00Z');

    await client.listOrders({ state: 'ARCHIVE', from: new Date(to.getTime() - 30 * 864e5), to });

    const ranges = spy.mock.calls.map(([url]) => {
      const q = new URL(String(url)).searchParams;
      return Number(q.get('filter[orders][creationDate][$le]')) - Number(q.get('filter[orders][creationDate][$ge]'));
    });
    expect(ranges).toHaveLength(3);
    expect(Math.max(...ranges)).toBeLessThan(14 * 864e5);
  });

  it('maps order entries with the seller SKU and category', async () => {
    const client = new KaspiClient('token', 'https://example.test', async () =>
      json({
        data: [
          {
            id: 'e1',
            attributes: {
              quantity: 2,
              basePrice: 3481,
              totalPrice: 6962,
              category: { code: 'Master - Hair care products', title: 'Средства по уходу за волосами' },
              offer: { code: '778839077', name: 'Medina Триоксидил' },
            },
          },
        ],
      }),
    );

    expect(await client.getOrderEntries('o1')).toEqual([
      {
        sku: '778839077',
        name: 'Medina Триоксидил',
        quantity: 2,
        basePrice: 3481,
        totalPrice: 6962,
        categoryCode: 'Master - Hair care products',
        categoryTitle: 'Средства по уходу за волосами',
      },
    ]);
  });
});

describe('isAwaitingHandover', () => {
  it('accepts an assembled order with a waybill that is not handed over yet («Передача»)', () => {
    expect(isAwaitingHandover(order())).toBe(true);
  });

  it('rejects orders still being packed («Упаковка»)', () => {
    expect(isAwaitingHandover(order({ assembled: false, waybillUrl: null }))).toBe(false);
  });

  it('rejects orders already handed to the courier («Переданы в доставку»)', () => {
    expect(isAwaitingHandover(order({ courierTransmissionDate: new Date() }))).toBe(false);
  });

  it('rejects cancelled orders and orders without a waybill', () => {
    expect(isAwaitingHandover(order({ status: 'CANCELLING' }))).toBe(false);
    expect(isAwaitingHandover(order({ waybillUrl: null }))).toBe(false);
  });

  it('rejects orders outside Kaspi Delivery', () => {
    expect(isAwaitingHandover(order({ state: 'PICKUP' }))).toBe(false);
  });
});

describe('KaspiClient.listOrders', () => {
  it('maps the assembled flag and the courier handover date', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'a',
              attributes: {
                code: '501',
                state: 'KASPI_DELIVERY',
                status: 'ACCEPTED_BY_MERCHANT',
                totalPrice: 4200,
                creationDate: 1_790_000_000_000,
                assembled: true,
                kaspiDelivery: { waybill: 'https://kaspi.kz/w/501', courierTransmissionDate: 1_790_100_000_000 },
              },
            },
            {
              id: 'b',
              attributes: {
                code: '502',
                state: 'KASPI_DELIVERY',
                status: 'ACCEPTED_BY_MERCHANT',
                totalPrice: 900,
                creationDate: 1_790_000_000_000,
                assembled: false,
                kaspiDelivery: { waybill: '' },
              },
            },
          ],
        }),
      );
    const client = new KaspiClient('token', 'https://example.test', fetchImpl);

    const [handedOver, packing] = await client.listOrders({ state: 'KASPI_DELIVERY', from: new Date(0) });

    expect(handedOver).toMatchObject({ code: '501', assembled: true, waybillUrl: 'https://kaspi.kz/w/501' });
    expect(handedOver!.courierTransmissionDate).toEqual(new Date(1_790_100_000_000));
    expect(packing).toMatchObject({ code: '502', assembled: false, waybillUrl: null, courierTransmissionDate: null });
  });
});
