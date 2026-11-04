import { describe, expect, it, vi } from 'vitest';
import {
  buildOfferUpdate,
  buildPreOrderRemoval,
  buildPreOrderUpdate,
  buildPriceUpdate,
  isRestockedOnPreOrder,
  CookieJar,
  KaspiCabinetAuthError,
  KaspiCabinetClient,
  KaspiCabinetOutOfStockError,
  KaspiCabinetRateLimitError,
  mapCabinetOffer,
  PREORDER_STOCK,
} from './cabinet';

// Форма ответа offer-view/details — по реальному товару магазина
const details = {
  sku: '015038176',
  title: 'ZAYN для хиджамы bi12 12 шт',
  available: true,
  cityInfo: [
    {
      id: '750000000',
      name: 'Алматы',
      price: 4990,
      oldPrice: 6700,
      pickupPoints: [
        { name: '4869024_PP1', available: false },
        { name: '4869024_PP4', available: true, stock: { value: 2, enabled: true } },
      ],
    },
    {
      id: '710000000',
      name: 'Астана',
      price: 5100,
      pickupPoints: [{ name: '4869024_PP7', available: true, stock: { value: 0, enabled: false } }],
    },
    { id: '620000000', name: 'Шымкент', price: null, pickupPoints: [{ name: '4869024_PP9', available: false }] },
  ],
};

describe('buildPriceUpdate', () => {
  it('changes only the price in the target city and keeps enabled warehouses with their stock', () => {
    expect(buildPriceUpdate(details, '4869024', '750000000', 4899)).toEqual({
      merchantUid: '4869024',
      sku: '015038176',
      model: 'ZAYN для хиджамы bi12 12 шт',
      cityPrices: [
        { cityId: '750000000', value: 4899 },
        { cityId: '710000000', value: 5100 },
      ],
      availabilities: [
        { available: 'yes', storeId: '4869024_PP4', stockCount: 2 },
        { available: 'yes', storeId: '4869024_PP7', stockCount: undefined },
      ],
    });
  });

  it('refuses to put a product on sale in a city where it is not sold', () => {
    expect(() => buildPriceUpdate(details, '4869024', '620000000', 4000)).toThrow(/not on sale/);
  });

  it('does not send warehouses whose tracked stock ran out', () => {
    const mixed = structuredClone(details);
    mixed.cityInfo[0]!.pickupPoints.push({ name: '4869024_PP5', available: true, stock: { value: 0, enabled: true } });
    const update = buildPriceUpdate(mixed, '4869024', '750000000', 4899);
    expect(update.availabilities.map((a) => a.storeId)).toEqual(['4869024_PP4', '4869024_PP7']);
  });

  it('refuses to change the price of a product that ran out, so it is not put back on sale', () => {
    const soldOut = structuredClone(details);
    soldOut.cityInfo[0]!.pickupPoints = [{ name: '4869024_PP4', available: true, stock: { value: 0, enabled: true } }];
    expect(() => buildPriceUpdate(soldOut, '4869024', '750000000', 4899)).toThrow(KaspiCabinetOutOfStockError);
  });

  it('refuses to change the price of a product removed from sale, so it is not put back on sale', () => {
    const removed = structuredClone(details) as any;
    removed.available = false;
    removed.cityInfo[0].pickupPoints = [{ name: '4869024_PP4', available: true }];
    expect(() => buildPriceUpdate(removed, '4869024', '750000000', 864)).toThrow(KaspiCabinetOutOfStockError);
  });

  it('keeps a product on pre-order when changing its price', () => {
    const soldOut = structuredClone(details);
    soldOut.cityInfo[0]!.pickupPoints = [{ name: '4869024_PP4', available: true, stock: { value: 0, enabled: true } }];
    expect(buildPriceUpdate(soldOut, '4869024', '750000000', 4899, 3).availabilities[0]).toEqual({
      available: 'yes',
      storeId: '4869024_PP4',
      preOrder: 3,
      stockEnabled: true,
      stockCount: PREORDER_STOCK,
    });
  });

  it('keeps the real stock of a product put on pre-order while it is in stock', () => {
    const inStock = structuredClone(details);
    inStock.cityInfo[0]!.pickupPoints = [
      { name: '4869024_PP4', available: true, stock: { value: 20, enabled: true } },
      { name: '4869024_PP5', available: true, stock: { value: 0, enabled: true } },
    ];
    expect(buildPreOrderUpdate(inStock, '4869024', 2).availabilities.slice(0, 2)).toEqual([
      { available: 'yes', storeId: '4869024_PP4', preOrder: 2, stockEnabled: true, stockCount: 20 },
      { available: 'yes', storeId: '4869024_PP5', preOrder: 2, stockEnabled: true, stockCount: PREORDER_STOCK },
    ]);
  });

  it('sends every warehouse as the seller set it in the table', () => {
    const update = buildOfferUpdate(details, '4869024', [
      { storeId: '4869024_PP4', available: true, stockCount: 12, preOrder: null },
      { storeId: '4869024_PP1', available: false, stockCount: null, preOrder: null },
      { storeId: '4869024_PP7', available: true, stockCount: null, preOrder: 5 },
    ], { cityId: '750000000', value: 4800 });
    expect(update.cityPrices).toEqual([
      { cityId: '750000000', value: 4800 },
      { cityId: '710000000', value: 5100 },
    ]);
    expect(update.availabilities).toEqual([
      { available: 'yes', storeId: '4869024_PP4', stockEnabled: true, stockCount: 12 },
      { available: 'no', storeId: '4869024_PP1' },
      { available: 'yes', storeId: '4869024_PP7', preOrder: 5, stockEnabled: true, stockCount: PREORDER_STOCK },
    ]);
  });

  it('refuses to switch off every warehouse', () => {
    expect(() =>
      buildOfferUpdate(details, '4869024', [{ storeId: '4869024_PP4', available: false, stockCount: 3, preOrder: null }]),
    ).toThrow(/хотя бы один склад/);
  });

  it('rejects an invalid price', () => {
    expect(() => buildPriceUpdate(details, '4869024', '750000000', 0)).toThrow(RangeError);
  });
});

const URLS = { idmc: 'https://idmc.shop.test', mc: 'https://mc.shop.test', cabinet: 'https://shop.test/mc/' };

function response(body: unknown, init: { status?: number; cookies?: string[]; location?: string } = {}): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const cookie of init.cookies ?? []) headers.append('Set-Cookie', cookie);
  if (init.location) headers.set('Location', init.location);
  return new Response(body === undefined ? null : JSON.stringify(body), { status: init.status ?? 200, headers });
}

const redirect = (location: string, cookies: string[] = []) => response(undefined, { status: 302, location, cookies });

const offer = {
  sku: '015038176',
  masterSku: '177625139',
  title: 'ZAYN bi12 12 шт',
  masterName: 'ZAYN для хиджамы Вакуумные банки с ручкой 12 шт',
  brandName: 'ZAYN',
  categoryCode: 'Massage cups',
  cityPrices: [{ value: 4990, cityId: '750000000' }],
  minPrice: 4990,
  available: true,
  availabilities: [
    { available: 'yes', storeId: 'm_PP4', stockCount: 5, stockSpecified: true },
    { available: 'no', storeId: 'm_PP1', stockCount: 0, stockSpecified: true },
  ],
};

const cookieSent = (call: unknown[]) => new Headers((call[1] as RequestInit).headers).get('Cookie');

describe('CookieJar', () => {
  it('keeps cookies with the same name apart per host', () => {
    const jar = new CookieJar();
    jar.store(response(null, { cookies: ['SESSION=idmc'] }), 'https://idmc.shop.test/login');
    jar.store(response(null, { cookies: ['SESSION=mc'] }), 'https://mc.shop.test/x');
    expect(jar.header('https://idmc.shop.test/api')).toBe('SESSION=idmc');
    expect(jar.header('https://mc.shop.test/api')).toBe('SESSION=mc');
  });

  it('sends Domain cookies to subdomains and forgets expired ones', () => {
    const jar = new CookieJar();
    jar.store(response(null, { cookies: ['shared=1; Domain=.shop.test; Path=/', 'gone=1'] }), 'https://mc.shop.test/');
    jar.store(response(null, { cookies: ['gone=; Max-Age=0'] }), 'https://mc.shop.test/');
    expect(jar.header('https://idmc.shop.test/')).toBe('shared=1');
    expect(jar.header('https://other.test/')).toBe('');
  });

  it('ignores a Domain attribute that does not cover the host', () => {
    const jar = new CookieJar();
    jar.store(response(null, { cookies: ['x=1; Domain=evil.test'] }), 'https://mc.shop.test/');
    expect(jar.header('https://evil.test/')).toBe('');
    expect(jar.header('https://mc.shop.test/')).toBe('x=1');
  });

  it('round-trips through JSON', () => {
    const jar = new CookieJar();
    jar.store(response(null, { cookies: ['sid=abc'] }), 'https://mc.shop.test/');
    expect(CookieJar.fromJSON(jar.toJSON()).header('https://mc.shop.test/')).toBe('sid=abc');
  });
});

describe('mapCabinetOffer', () => {
  it('maps the fields the repricer and the product list need', () => {
    expect(mapCabinetOffer(offer)).toEqual({
      sku: '015038176',
      masterSku: '177625139',
      name: 'ZAYN для хиджамы Вакуумные банки с ручкой 12 шт',
      brand: 'ZAYN',
      category: 'Massage cups',
      cityPrices: { '750000000': 4990 },
      minPrice: 4990,
      stock: 5,
      available: true,
      preOrder: null,
      stores: [{ storeId: 'm_PP4', available: true, stockCount: 5, preOrder: null }, { storeId: 'm_PP1', available: false, stockCount: 0, preOrder: null }],
      imageUrl: null,
      shopUrl: null,
    });
  });

  it('builds the photo and the storefront link', () => {
    const withMedia = {
      ...offer,
      imagesV2: [{ small: 'https://resources.cdn-kaspi.kz/img/m/p/a/b/1.jpg?format=gallery-small' }],
      shopLink: '/p/zayn-dlja-hidzhamy-177625139/',
    };
    expect(mapCabinetOffer(withMedia)).toMatchObject({
      imageUrl: 'https://resources.cdn-kaspi.kz/img/m/p/a/b/1.jpg?format=gallery-small',
      shopUrl: 'https://kaspi.kz/shop/p/zayn-dlja-hidzhamy-177625139/',
    });
  });

  it('tells a restocked product on pre-order from our placeholder stock', () => {
    const base = mapCabinetOffer(offer);
    const ours = { ...base, preOrder: 3, stores: [{ storeId: 'm_PP4', available: true, stockCount: PREORDER_STOCK, preOrder: 3 }] };
    const restocked = { ...base, preOrder: 3, stores: [{ storeId: 'm_PP4', available: true, stockCount: 20, preOrder: 3 }] };
    expect(isRestockedOnPreOrder(ours)).toBe(false);
    expect(isRestockedOnPreOrder(restocked)).toBe(true);
    expect(isRestockedOnPreOrder({ ...restocked, preOrder: null })).toBe(false);
  });

  it('removes pre-order keeping only warehouses with real stock', () => {
    const twoPoints = structuredClone(details);
    twoPoints.cityInfo[0]!.pickupPoints = [
      { name: '4869024_PP4', available: true, stock: { value: 999, enabled: true } },
      { name: '4869024_PP5', available: true, stock: { value: 999, enabled: true } },
    ];
    const update = buildPreOrderRemoval(twoPoints, '4869024', new Map([['4869024_PP4', 20]]));
    expect(update.availabilities).toEqual([{ available: 'yes', storeId: '4869024_PP4', stockEnabled: true, stockCount: 20 }]);
  });

  it('reads pre-order days of a product on pre-order', () => {
    const onPreOrder = { ...offer, availabilities: [{ available: 'yes', storeId: 'm_PP4', stockCount: null, preOrder: 3, stockSpecified: false }] };
    expect(mapCabinetOffer(onPreOrder)).toMatchObject({ preOrder: 3, stock: null });
  });

  it('reports unknown stock when no warehouse has it specified', () => {
    expect(mapCabinetOffer({ ...offer, availabilities: [{ available: 'yes', stockSpecified: false }] }).stock).toBeNull();
  });
});

describe('KaspiCabinetClient', () => {
  it('logs in through the cabinet OAuth flow and ends up with the cabinet session', async () => {
    const fetchImpl = vi
      .fn()
      // 1. кабинет отправляет на сервис входа
      .mockResolvedValueOnce(redirect('https://idmc.shop.test/oauth2/authorize?state=s', ['MC_STATE=1']))
      .mockResolvedValueOnce(redirect('/login', ['IDMC=a']))
      .mockResolvedValueOnce(response(undefined))
      // 2. логин и пароль
      .mockResolvedValueOnce(response({ redirectUrl: 'https://idmc.shop.test/oauth2/authorize?state=s' }, { cookies: ['IDMC=b'] }))
      // 3. возврат в кабинет с кодом
      .mockResolvedValueOnce(redirect('https://mc.shop.test/login/oauth2/code/1?code=c&state=s'))
      .mockResolvedValueOnce(redirect('https://shop.test/mc/', ['SESSION=mc-session']))
      .mockResolvedValueOnce(response(undefined));
    const client = new KaspiCabinetClient(new CookieJar(), fetchImpl, URLS);

    expect(await client.login('user@mail.kz', 'secret', '4869024')).toEqual({ status: 'OK' });

    const calls = fetchImpl.mock.calls as [string, RequestInit][];
    expect(calls[0]![0]).toBe('https://mc.shop.test/oauth2/authorization/1?redirectUrl=https%3A%2F%2Fshop.test%2Fmc%2F');
    expect(calls[3]![0]).toBe('https://idmc.shop.test/api/p/login');
    expect(JSON.parse(String(calls[3]![1].body))).toEqual({ _u: 'user@mail.kz', _p: 'secret', _r_d: true });
    expect(cookieSent(calls[3]!)).toBe('IDMC=a');
    // кука состояния кабинета возвращается в кабинет вместе с кодом
    expect(calls[5]![0]).toBe('https://mc.shop.test/login/oauth2/code/1?code=c&state=s');
    expect(cookieSent(calls[5]!)).toBe('MC_STATE=1');
    expect(client.jar.header('https://mc.shop.test/bff')).toBe('MC_STATE=1; SESSION=mc-session');
    expect(client.trace[3]).toBe('POST idmc.shop.test/api/p/login → 200');
  });

  it('asks for the e-mail code and completes the login with it', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(undefined))
      .mockResolvedValueOnce(response({ email: 'u***@mail.kz' }))
      .mockResolvedValueOnce(response({ redirectUrl: 'https://shop.test/mc/' }))
      .mockResolvedValueOnce(response(undefined));
    const client = new KaspiCabinetClient(new CookieJar(), fetchImpl, URLS);

    expect(await client.login('user@mail.kz', 'secret', '1')).toEqual({ status: 'MFA_REQUIRED', email: 'u***@mail.kz' });
    expect(await client.submitMfaCode('123456', 'u***@mail.kz', '1')).toEqual({ status: 'OK' });
    expect(JSON.parse(String((fetchImpl.mock.calls[2] as [string, RequestInit])[1].body))).toEqual({
      _m_c: '123456',
      _r_d: true,
      _u: 'u***@mail.kz',
    });
  });

  it('selects the merchant when the user has access to several', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(undefined))
      .mockResolvedValueOnce(response({ su: true }))
      .mockResolvedValueOnce(response({ redirectUrl: 'https://shop.test/mc/' }))
      .mockResolvedValueOnce(response(undefined));
    const client = new KaspiCabinetClient(new CookieJar(), fetchImpl, URLS);

    await client.login('u', 'p', '4869024');

    expect(JSON.parse(String((fetchImpl.mock.calls[2] as [string, RequestInit])[1].body))).toEqual({ _s_m: '4869024' });
  });

  it('reports the Kaspi error code when the login is rejected', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(undefined))
      .mockResolvedValueOnce(response({ code: 'CREDENTIALS_INVALID' }, { status: 400 }));
    const client = new KaspiCabinetClient(new CookieJar(), fetchImpl, URLS);

    await expect(client.login('u', 'wrong', '1')).rejects.toThrow('Kaspi не принял логин или пароль');
  });

  it('refreshes the cabinet session without a password while the login service remembers the user', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirect('https://idmc.shop.test/oauth2/authorize'))
      .mockResolvedValueOnce(redirect('https://mc.shop.test/login/oauth2/code/1?code=c'))
      .mockResolvedValueOnce(redirect('https://shop.test/mc/', ['SESSION=new']))
      .mockResolvedValueOnce(response(undefined));
    const client = new KaspiCabinetClient(new CookieJar(), fetchImpl, URLS);

    expect(await client.refreshSession()).toBe(true);
    expect(client.jar.header('https://mc.shop.test/')).toBe('SESSION=new');
  });

  it('reports that a password is needed when the login service shows its login page', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirect('https://idmc.shop.test/login'))
      .mockResolvedValueOnce(response(undefined));
    const client = new KaspiCabinetClient(new CookieJar(), fetchImpl, URLS);

    expect(await client.refreshSession()).toBe(false);
  });

  it('lists all offers on sale across pages', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ data: [offer, { ...offer, sku: 'B' }], total: 3 }, { status: 201 }))
      .mockResolvedValueOnce(response({ data: [{ ...offer, sku: 'C' }], total: 3 }, { status: 201 }));
    const jar = new CookieJar();
    jar.store(response(null, { cookies: ['SESSION=x'] }), 'https://mc.shop.test/');
    const client = new KaspiCabinetClient(jar, fetchImpl, URLS);

    const offers = await client.listActiveOffers('4869024');

    expect(offers.map((o) => o.sku)).toEqual(['015038176', 'B', 'C']);
    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(new URL(url).searchParams.get('start')).toBe('2');
    expect(new URL(url).searchParams.get('m')).toBe('4869024');
    expect(JSON.parse(String(init.body))).toEqual({ available: true });
    expect(cookieSent(fetchImpl.mock.calls[0]!)).toBe('SESSION=x');
  });

  it('updates a price from the current offer details', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(details))
      .mockResolvedValueOnce(response(undefined, { status: 200 }));
    const client = new KaspiCabinetClient(new CookieJar(), fetchImpl, URLS);

    await client.updatePrice('4869024', '015038176', '750000000', 4899);

    const calls = fetchImpl.mock.calls as [string, RequestInit][];
    expect(calls[0]![0]).toBe('https://mc.shop.test/bff/offer-view/details?m=4869024&s=015038176');
    expect(calls[1]![0]).toBe('https://mc.shop.test/pricefeed/upload/merchant/process');
    expect(calls[1]![1].method).toBe('POST');
    expect(JSON.parse(String(calls[1]![1].body)).cityPrices[0]).toEqual({ cityId: '750000000', value: 4899 });
  });

  it('signals the price change limit', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(details))
      .mockResolvedValueOnce(response({ message: 'Too many' }, { status: 429 }));
    const client = new KaspiCabinetClient(new CookieJar(), fetchImpl, URLS);

    await expect(client.updatePrice('4869024', '015038176', '750000000', 4899)).rejects.toBeInstanceOf(
      KaspiCabinetRateLimitError,
    );
  });

  it('signals an expired session', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({ message: 'Unauthorized' }, { status: 401 }));
    const client = new KaspiCabinetClient(new CookieJar(), fetchImpl, URLS);

    await expect(client.listActiveOffers('1')).rejects.toBeInstanceOf(KaspiCabinetAuthError);
  });
});
