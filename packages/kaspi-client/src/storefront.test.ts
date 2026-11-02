import { describe, expect, it, vi } from 'vitest';
import { KaspiStorefrontError, KaspiStorefrontPriceSource, masterSkuFromUrl } from './storefront';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const offer = (merchantId: string, price: number) => ({ merchantId, merchantName: `Shop ${merchantId}`, price });

describe('masterSkuFromUrl', () => {
  it('extracts the product code from a card URL', () => {
    expect(masterSkuFromUrl('https://kaspi.kz/shop/p/antiseptik-sprei-50-ml-102047085/')).toBe('102047085');
    expect(masterSkuFromUrl('https://kaspi.kz/shop/p/antiseptik-sprei-50-ml-102047085/?c=750000000')).toBe('102047085');
    expect(masterSkuFromUrl('https://kaspi.kz/shop/p/102047085')).toBe('102047085');
  });

  it('returns null for other URLs', () => {
    expect(masterSkuFromUrl('https://kaspi.kz/shop/search/?text=102047085')).toBeNull();
  });
});

describe('KaspiStorefrontPriceSource', () => {
  it('requests the card offers and maps them', async () => {
    const fetchImpl = vi.fn(async () => json({ offers: [offer('A', 419.0), offer('B', 439.6)], total: 2 }));
    const source = new KaspiStorefrontPriceSource({ fetchImpl, minIntervalMs: 0 });

    const offers = await source.getOffers({ masterSku: '102047085', cityId: '750000000' });

    expect(offers).toEqual([
      { merchantId: 'A', merchantName: 'Shop A', price: 419 },
      { merchantId: 'B', merchantName: 'Shop B', price: 440 },
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://kaspi.kz/yml/offer-view/offers/102047085');
    expect(JSON.parse(String(init.body))).toMatchObject({ cityId: '750000000', id: '102047085', page: 0 });
  });

  it('keeps the seller SKU when the storefront returns it', async () => {
    const fetchImpl = async () => json({ offers: [{ merchantId: 'A', price: 100, merchantSku: 'zayn100' }], total: 1 });
    const source = new KaspiStorefrontPriceSource({ fetchImpl, minIntervalMs: 0 });

    const [first] = await source.getOffers({ masterSku: '1', cityId: '750000000' });

    expect(first?.merchantSku).toBe('zayn100');
  });

  it('follows pages until all offers are loaded', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ offers: [offer('A', 100), offer('B', 110)], total: 3 }))
      .mockResolvedValueOnce(json({ offers: [offer('C', 120)], total: 3 }));
    const source = new KaspiStorefrontPriceSource({ fetchImpl, minIntervalMs: 0 });

    const offers = await source.getOffers({ masterSku: '1', cityId: '750000000' });

    expect(offers.map((o) => o.merchantId)).toEqual(['A', 'B', 'C']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns an empty list when the card has no sellers', async () => {
    const source = new KaspiStorefrontPriceSource({ fetchImpl: async () => json({ offers: [], total: 0 }), minIntervalMs: 0 });
    expect(await source.getOffers({ masterSku: '1', cityId: '750000000' })).toEqual([]);
  });

  it('throws on an error response and keeps working afterwards', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('blocked', { status: 429 }))
      .mockResolvedValueOnce(json({ offers: [offer('A', 100)], total: 1 }));
    const source = new KaspiStorefrontPriceSource({ fetchImpl, minIntervalMs: 0 });

    await expect(source.getOffers({ masterSku: '1', cityId: '750000000' })).rejects.toBeInstanceOf(KaspiStorefrontError);
    expect(await source.getOffers({ masterSku: '1', cityId: '750000000' })).toHaveLength(1);
  });

  it('reports safe diagnostics of a 405 response without touching the request', async () => {
    const html = '<html><body>blocked ' + 'ab cd '.repeat(100) + '</body></html>';
    const fetchImpl = vi.fn(
      async () =>
        new Response(html, {
          status: 405,
          headers: { Server: 'nginx', Allow: 'GET, HEAD', 'Content-Type': 'text/html', 'Set-Cookie': 'sid=secret', Location: '/blocked' },
        }),
    );
    const source = new KaspiStorefrontPriceSource({ fetchImpl, minIntervalMs: 0 });

    const error = await source.getOffers({ masterSku: '7', cityId: '750000000' }).catch((e) => e);

    expect(error).toBeInstanceOf(KaspiStorefrontError);
    expect(error.status).toBe(405);
    expect(error.info).toMatchObject({ server: 'nginx', allow: 'GET, HEAD', contentType: 'text/html', location: '/blocked', redirected: false });
    expect(error.info.snippet.length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(error.info)).not.toContain('secret');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://kaspi.kz/yml/offer-view/offers/7');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Accept: 'application/json, text/*',
      'Content-Type': 'application/json; charset=UTF-8',
      Referer: 'https://kaspi.kz/shop/p/-7/',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      cityId: '750000000',
      id: '7',
      merchantUUID: [],
      limit: 50,
      page: 0,
      sortOption: 'PRICE',
      installationId: '-1',
    });
  });

  it('redacts token-like strings and reports 429 diagnostics', async () => {
    const token = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
    const fetchImpl = vi.fn(async () => new Response(`too many ${token}`, { status: 429, headers: { 'Content-Type': 'text/plain' } }));
    const source = new KaspiStorefrontPriceSource({ fetchImpl, minIntervalMs: 0 });

    const error = await source.getOffers({ masterSku: '8', cityId: '750000000' }).catch((e) => e);

    expect(error.status).toBe(429);
    expect(error.info.snippet).toBe('too many [скрыто]');
    expect(error.info.contentType).toBe('text/plain');
  });

  it('spaces requests by the minimum interval', async () => {
    const times: number[] = [];
    const fetchImpl = async () => {
      times.push(Date.now());
      return json({ offers: [], total: 0 });
    };
    const source = new KaspiStorefrontPriceSource({ fetchImpl, minIntervalMs: 60 });

    await Promise.all([
      source.getOffers({ masterSku: '1', cityId: '750000000' }),
      source.getOffers({ masterSku: '2', cityId: '750000000' }),
    ]);

    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(55);
  });
});
