// Клиент кабинета продавца Kaspi (kaspi.kz/mc) — для того, чего нет в
// официальном API: списка товаров в продаже с ценами и остатками.
// Использует те же запросы, что и страницы кабинета; это не официальный API,
// и Kaspi может изменить его без предупреждения. Запросы и поля выяснены по
// коду страниц входа и «Управление товарами» в октябре 2026 года.
//
// Как устроен вход (так же, как в браузере):
// 1. mc.shop.kaspi.kz/oauth2/authorization/1 перенаправляет на сервис входа idmc.
// 2. На idmc отправляются логин и пароль (и при необходимости код из почты).
// 3. idmc возвращает ссылку, по которой цепочка перенаправлений приводит обратно
//    в кабинет с кодом авторизации; кабинет ставит свою куку сессии.
// Пока жива сессия idmc, шаг 1 сам проводит по цепочке без пароля.

const IDMC_URL = 'https://idmc.shop.kaspi.kz';
const MC_URL = 'https://mc.shop.kaspi.kz';
const CABINET_URL = 'https://kaspi.kz/mc/';
const OFFERS_PAGE_SIZE = 50;
const MAX_REDIRECTS = 10;

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  /** Кука без атрибута Domain отправляется только на тот же хост. */
  hostOnly: boolean;
}

/** Куки сессии кабинета с учётом домена. Сериализуются в JSON, чтобы сессию можно было сохранить. */
export class CookieJar {
  private cookies: StoredCookie[] = [];

  static fromJSON(json: string): CookieJar {
    const jar = new CookieJar();
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) jar.cookies = parsed;
    return jar;
  }

  toJSON(): string {
    return JSON.stringify(this.cookies);
  }

  get size(): number {
    return this.cookies.length;
  }

  /** Запоминает куки из ответа на запрос к `url`; удалённые сервером забывает. */
  store(res: Response, url: string): void {
    const host = new URL(url).hostname;
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';');
      const eq = pair!.indexOf('=');
      if (eq <= 0) continue;
      const name = pair!.slice(0, eq).trim();
      const value = pair!.slice(eq + 1).trim();

      const domainAttr = attributes
        .map((a) => a.trim())
        .find((a) => /^domain=/i.test(a))
        ?.slice('domain='.length)
        .replace(/^\./, '')
        .toLowerCase();
      // Чужой Domain (не родительский для хоста) браузер отбрасывает — делаем так же
      const validDomain = !!domainAttr && (host === domainAttr || host.endsWith(`.${domainAttr}`));
      const domain = validDomain ? domainAttr! : host;
      const hostOnly = !validDomain;

      this.cookies = this.cookies.filter((c) => !(c.name === name && c.domain === domain));
      const expired = /max-age=0\b/i.test(line) || /expires=[^;]*1970/i.test(line);
      if (!expired && value !== '') this.cookies.push({ name, value, domain, hostOnly });
    }
  }

  /** Заголовок Cookie для запроса к `url`. */
  header(url: string): string {
    const host = new URL(url).hostname;
    return this.cookies
      .filter((c) => (c.hostOnly ? host === c.domain : host === c.domain || host.endsWith(`.${c.domain}`)))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  }
}

export class KaspiCabinetError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message);
  }
}

/** Сессия истекла или её нет — нужно войти заново. */
export class KaspiCabinetAuthError extends KaspiCabinetError {}

/** Kaspi ограничивает число изменений цены; лимит исчерпан (HTTP 429). */
export class KaspiCabinetRateLimitError extends KaspiCabinetError {}

/** Тело запроса изменения цены — в том же виде, что отправляет форма цены в кабинете. */
export interface PriceUpdatePayload {
  merchantUid: string;
  sku: string;
  model: string;
  cityPrices: { cityId: string; value: number }[];
  availabilities: { available: 'yes'; storeId: string; stockCount?: number }[];
}

/** Товар закончился на всех складах города: цену не меняем, чтобы не вернуть его в продажу. */
export class KaspiCabinetOutOfStockError extends KaspiCabinetError {}

/** Склад включён и на нём есть товар; склад без учёта остатков считается в наличии. */
const hasStock = (point: any) => point?.available === true && !(point.stock?.enabled && Number(point.stock.value ?? 0) <= 0);

/**
 * Собирает изменение цены из текущих данных товара (offer-view/details):
 * меняется только цена в городе `cityId`. Склады передаются те же, что сейчас
 * включены, с теми же остатками, — иначе Kaspi может снять наличие. Склады с
 * нулевым остатком не передаются: «в наличии» с нулём вернуло бы закончившийся
 * товар в продажу вместо архива.
 */
export function buildPriceUpdate(details: any, merchantId: string, cityId: string, price: number): PriceUpdatePayload {
  if (!Number.isInteger(price) || price <= 0) throw new RangeError(`Invalid price: ${price}`);

  const cityPrices: PriceUpdatePayload['cityPrices'] = [];
  const availabilities: PriceUpdatePayload['availabilities'] = [];
  const cities: any[] = Array.isArray(details?.cityInfo) ? details.cityInfo : [];
  const target = cities.find((c) => String(c?.id) === cityId);
  const targetPoints = (Array.isArray(target?.pickupPoints) ? target.pickupPoints : []).filter((p: any) => p?.available === true);
  if (target?.price && targetPoints.length > 0 && !targetPoints.some(hasStock)) {
    throw new KaspiCabinetOutOfStockError(200, '', `Product ${details?.sku} is out of stock in city ${cityId}`);
  }
  for (const city of cities) {
    const points = (Array.isArray(city?.pickupPoints) ? city.pickupPoints : []).filter(hasStock);
    if (!city?.price || points.length === 0) continue;

    cityPrices.push({ cityId: String(city.id), value: String(city.id) === cityId ? price : Number(city.price) });
    for (const point of points) {
      availabilities.push({
        available: 'yes',
        storeId: String(point.name),
        stockCount: point.stock?.enabled ? Number(point.stock.value ?? 0) : undefined,
      });
    }
  }

  if (!cityPrices.some((c) => c.cityId === cityId)) {
    throw new KaspiCabinetError(200, '', `Product ${details?.sku} is not on sale in city ${cityId}`);
  }
  return { merchantUid: merchantId, sku: String(details.sku), model: String(details.title ?? ''), cityPrices, availabilities };
}

export type CabinetLoginResult = { status: 'OK' } | { status: 'MFA_REQUIRED'; email: string };

/** Товар из вкладки «В продаже» кабинета. */
export interface CabinetOffer {
  /** Артикул продавца. */
  sku: string;
  /** Номер общей карточки товара на Kaspi. */
  masterSku: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  /** Цена по кодам городов. */
  cityPrices: Record<string, number>;
  minPrice: number | null;
  /** Сумма остатков по складам, где товар в наличии; null — остатки не указаны. */
  stock: number | null;
  available: boolean;
}

export class KaspiCabinetClient {
  /** Последняя цепочка переходов: хост, путь и код ответа — для диагностики, без параметров. */
  readonly trace: string[] = [];

  constructor(
    readonly jar: CookieJar = new CookieJar(),
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly urls = { idmc: IDMC_URL, mc: MC_URL, cabinet: CABINET_URL },
  ) {}

  /**
   * Вход по логину и паролю пользователя кабинета. Если Kaspi не узнал
   * устройство, он отправляет код на почту — тогда нужен submitMfaCode.
   */
  async login(username: string, password: string, merchantId: string): Promise<CabinetLoginResult> {
    this.trace.length = 0;
    await this.startAuthorization();
    const data = await this.postLogin({ _u: username, _p: password, _r_d: true });
    return this.finishLogin(data, merchantId);
  }

  async submitMfaCode(code: string, email: string, merchantId: string): Promise<CabinetLoginResult> {
    const data = await this.postLogin({ _m_c: code, _r_d: true, _u: email });
    return this.finishLogin(data, merchantId);
  }

  /**
   * Обновляет сессию кабинета без пароля, пока жива сессия сервиса входа.
   * Возвращает false, если нужен вход по паролю.
   */
  async refreshSession(): Promise<boolean> {
    this.trace.length = 0;
    const finalUrl = await this.startAuthorization();
    return !new URL(finalUrl).hostname.startsWith(new URL(this.urls.idmc).hostname);
  }

  /** Все товары вкладки «В продаже». */
  async listActiveOffers(merchantId: string): Promise<CabinetOffer[]> {
    const offers: CabinetOffer[] = [];

    for (let start = 0; ; ) {
      const query = new URLSearchParams({
        m: merchantId,
        l: String(OFFERS_PAGE_SIZE),
        start: String(start),
        sortBy: 'DATE_DESC',
      });
      const url = `${this.urls.mc}/bff/offer-view/v2/list?${query}`;
      const res = await this.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
          Origin: 'https://kaspi.kz',
          Referer: this.urls.cabinet,
          'x-merchant': merchantId,
        },
        body: JSON.stringify({ available: true }),
      });
      await this.ensureOk(res);
      const body: any = await res.json();
      const raw: any[] = Array.isArray(body?.data) ? body.data : [];
      offers.push(...raw.map(mapCabinetOffer).filter((o) => o.sku !== ''));
      start += raw.length;
      if (raw.length === 0 || start >= Number(body?.total ?? 0)) return offers;
    }
  }

  /** Текущие данные товара: цены по городам и склады с остатками. */
  async getOfferDetails(merchantId: string, sku: string): Promise<any> {
    const query = new URLSearchParams({ m: merchantId, s: sku });
    const res = await this.request(`${this.urls.mc}/bff/offer-view/details?${query}`, {
      method: 'GET',
      headers: { Accept: 'application/json, text/plain, */*', Origin: 'https://kaspi.kz', Referer: this.urls.cabinet },
    });
    await this.ensureOk(res);
    return res.json();
  }

  /** Меняет цену товара в одном городе так же, как форма цены в кабинете. */
  async updatePrice(merchantId: string, sku: string, cityId: string, price: number): Promise<void> {
    const payload = buildPriceUpdate(await this.getOfferDetails(merchantId, sku), merchantId, cityId, price);
    const res = await this.request(`${this.urls.mc}/pricefeed/upload/merchant/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://kaspi.kz',
        Referer: this.urls.cabinet,
      },
      body: JSON.stringify(payload),
    });
    await this.ensureOk(res);
    await res.arrayBuffer().catch(() => undefined);
  }

  private async ensureOk(res: Response): Promise<void> {
    if (res.ok) return;
    const body = await res.text();
    if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
      throw new KaspiCabinetAuthError(res.status, body, `Kaspi cabinet session is not valid (HTTP ${res.status})`);
    }
    if (res.status === 429) throw new KaspiCabinetRateLimitError(429, body, 'Kaspi price change limit reached');
    throw new KaspiCabinetError(res.status, body, `Kaspi cabinet responded with ${res.status}`);
  }

  /** Начинает OAuth-вход кабинета; возвращает адрес, на котором остановилась цепочка. */
  private startAuthorization(): Promise<string> {
    const url = new URL(`${this.urls.mc}/oauth2/authorization/1`);
    url.searchParams.set('redirectUrl', this.urls.cabinet);
    return this.follow(url.toString());
  }

  private async finishLogin(data: any, merchantId: string): Promise<CabinetLoginResult> {
    // Пользователь с доступом к нескольким магазинам сначала выбирает магазин
    if (data?.su) data = await this.postLogin({ _s_m: merchantId });
    if (data?.email) return { status: 'MFA_REQUIRED', email: String(data.email) };
    if (data?.redirectUrl) {
      await this.follow(String(data.redirectUrl));
      return { status: 'OK' };
    }
    throw new KaspiCabinetError(200, JSON.stringify(data).slice(0, 300), 'Unexpected Kaspi login response');
  }

  private async postLogin(body: Record<string, unknown>): Promise<any> {
    const url = `${this.urls.idmc}/api/p/login`;
    const res = await this.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        Origin: this.urls.idmc,
        Referer: `${this.urls.idmc}/login`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      const code = /"(?:code|error|errorCode)"\s*:\s*"([A-Z_]+)"/.exec(text)?.[1];
      throw new KaspiCabinetError(res.status, text, `Kaspi login failed: ${code ?? res.status}`);
    }
    return text ? JSON.parse(text) : null;
  }

  /** Проходит по цепочке перенаправлений, собирая куки на каждом шаге. */
  private async follow(url: string): Promise<string> {
    let next = new URL(url, this.urls.idmc).toString();
    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      const res = await this.request(next, { method: 'GET', headers: { Accept: 'text/html,*/*' } });
      const location = res.headers.get('location');
      await res.arrayBuffer().catch(() => undefined);
      if (!location || res.status < 300 || res.status >= 400) return next;
      next = new URL(location, next).toString();
    }
    return next;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = this.jar.header(url);
    if (cookie) headers.set('Cookie', cookie);
    const res = await this.fetchImpl(url, { ...init, headers, redirect: 'manual' });
    this.jar.store(res, url);
    const { hostname, pathname } = new URL(url);
    this.trace.push(`${init.method ?? 'GET'} ${hostname}${pathname} → ${res.status}`);
    return res;
  }
}

export function mapCabinetOffer(raw: any): CabinetOffer {
  const cityPrices: Record<string, number> = {};
  for (const entry of Array.isArray(raw?.cityPrices) ? raw.cityPrices : []) {
    if (entry?.cityId != null && Number(entry.value) > 0) cityPrices[String(entry.cityId)] = Math.round(Number(entry.value));
  }

  const availabilities: any[] = Array.isArray(raw?.availabilities) ? raw.availabilities : [];
  const specified = availabilities.filter((a) => a?.stockSpecified);
  const stock = specified.length === 0
    ? null
    : specified.filter((a) => a.available === 'yes').reduce((sum, a) => sum + (Number(a.stockCount) || 0), 0);

  const minPrice = Number(raw?.minPrice);
  return {
    sku: String(raw?.sku ?? ''),
    masterSku: raw?.masterSku != null ? String(raw.masterSku) : null,
    name: String(raw?.masterName ?? raw?.title ?? raw?.model ?? ''),
    brand: raw?.brandName ?? raw?.brand ?? null,
    category: raw?.categoryCode ?? null,
    cityPrices,
    minPrice: minPrice > 0 ? Math.round(minPrice) : null,
    stock,
    available: raw?.available === true,
  };
}
