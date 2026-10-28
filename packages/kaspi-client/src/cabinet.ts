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
/** Идентификатор «устройства» для чата; браузер берёт случайный и хранит в localStorage. */
const CHAT_APP_ID = '7C1F2A9E-4B3D-4E8A-9F21-5A6B7C8D9E0F';
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
  /** preOrder — дней предзаказа, как одноимённое поле прайс-листа Kaspi. */
  availabilities: { available: 'yes' | 'no'; storeId: string; stockCount?: number; stockEnabled?: boolean; preOrder?: number }[];
}

/** Склад товара: наличие, остаток (null — без учёта остатков) и предзаказ. */
export interface StoreState {
  storeId: string;
  available: boolean;
  stockCount: number | null;
  preOrder: number | null;
}

/**
 * Наличие и остатки по складам — как их задаёт продавец в таблице: склады передаются
 * все, выключенные — «нет». Цены по городам прежние; `price` меняет цену в одном городе.
 * Склад на предзаказе остаётся на предзаказе.
 */
export function buildOfferUpdate(
  details: any,
  merchantId: string,
  stores: StoreState[],
  price?: { cityId: string; value: number },
): PriceUpdatePayload {
  const cities: any[] = Array.isArray(details?.cityInfo) ? details.cityInfo : [];
  const cityOf = new Map<string, any>();
  for (const city of cities) for (const p of Array.isArray(city?.pickupPoints) ? city.pickupPoints : []) cityOf.set(String(p.name), city);

  const cityPrices: PriceUpdatePayload['cityPrices'] = [];
  for (const city of cities) {
    const cityId = String(city.id);
    const value = price?.cityId === cityId ? price.value : Number(city.price);
    const sold = stores.some((s) => s.available && cityOf.get(s.storeId) === city);
    if (sold && value > 0) cityPrices.push({ cityId, value });
  }
  const availabilities: PriceUpdatePayload['availabilities'] = stores.map((s) =>
    !s.available
      ? { available: 'no', storeId: s.storeId }
      : s.preOrder
        ? { available: 'yes', storeId: s.storeId, preOrder: s.preOrder, stockEnabled: true, stockCount: PREORDER_STOCK }
        : s.stockCount !== null
          ? { available: 'yes', storeId: s.storeId, stockEnabled: true, stockCount: s.stockCount }
          : { available: 'yes', storeId: s.storeId },
  );
  if (!availabilities.some((a) => a.available === 'yes')) {
    throw new KaspiCabinetError(200, '', 'Нужен хотя бы один склад в наличии — иначе товар уйдёт в архив.');
  }
  if (price && !cityPrices.some((c) => c.cityId === price.cityId)) {
    throw new KaspiCabinetError(200, '', `Product ${details?.sku} is not on sale in city ${price.cityId}`);
  }
  return { merchantUid: merchantId, sku: String(details.sku), model: String(details.title ?? ''), cityPrices, availabilities };
}

/**
 * Остаток, который ставится складу с учётом остатков на время предзаказа: с нулём Kaspi
 * считает товар закончившимся и снимает с продажи. Так же делает Okto (Zoomia).
 */
export const PREORDER_STOCK = 999;

/** Остаток склада на предзаказе: настоящий, пока товар есть, иначе PREORDER_STOCK. */
function preOrderStock(point: any): number {
  const value = point?.stock?.enabled ? Number(point.stock.value ?? 0) : 0;
  return value > 0 && value !== PREORDER_STOCK ? value : PREORDER_STOCK;
}


/**
 * Предзаказ на `days` дней (null — снять): все включённые склады остаются «в наличии»,
 * цены по городам — прежние, остатки — настоящие (Kaspi так принимает, применяет минут
 * через 10–15), а закончившимся складам PREORDER_STOCK.
 */
export function buildPreOrderUpdate(details: any, merchantId: string, days: number | null): PriceUpdatePayload {
  if (days !== null && (!Number.isInteger(days) || days <= 0)) throw new RangeError(`Invalid pre-order days: ${days}`);
  const cityPrices: PriceUpdatePayload['cityPrices'] = [];
  const availabilities: PriceUpdatePayload['availabilities'] = [];
  for (const city of Array.isArray(details?.cityInfo) ? details.cityInfo : []) {
    const points = (Array.isArray(city?.pickupPoints) ? city.pickupPoints : []).filter((p: any) => p?.available === true);
    if (!city?.price || points.length === 0) continue;
    cityPrices.push({ cityId: String(city.id), value: Number(city.price) });
    for (const point of points) {
      availabilities.push({
        available: 'yes',
        storeId: String(point.name),
        ...(days
          ? // У снятого с продажи товара Kaspi не отдаёт данные об учёте остатков — ставим остаток всегда
            { preOrder: days, stockEnabled: true, stockCount: preOrderStock(point) }
          : { stockCount: point.stock?.enabled ? Number(point.stock.value ?? 0) : undefined }),
      });
    }
  }
  if (cityPrices.length === 0) throw new KaspiCabinetError(200, '', `Product ${details?.sku} has no enabled warehouses`);
  return { merchantUid: merchantId, sku: String(details.sku), model: String(details.title ?? ''), cityPrices, availabilities };
}

/**
 * Снятие предзаказа после поставки: склады с настоящим остатком передаются с этим
 * остатком и без preOrder, цены — прежние. Склады без настоящего остатка не передаются,
 * иначе «в наличии» с нулём держало бы закончившийся товар в продаже.
 */
export function buildPreOrderRemoval(details: any, merchantId: string, stocks: Map<string, number>): PriceUpdatePayload {
  const cityPrices: PriceUpdatePayload['cityPrices'] = [];
  const availabilities: PriceUpdatePayload['availabilities'] = [];
  for (const city of Array.isArray(details?.cityInfo) ? details.cityInfo : []) {
    const points = (Array.isArray(city?.pickupPoints) ? city.pickupPoints : []).filter(
      (p: any) => p?.available === true && (stocks.get(String(p.name)) ?? 0) > 0,
    );
    if (!city?.price || points.length === 0) continue;
    cityPrices.push({ cityId: String(city.id), value: Number(city.price) });
    for (const point of points) {
      availabilities.push({ available: 'yes', storeId: String(point.name), stockEnabled: true, stockCount: stocks.get(String(point.name))! });
    }
  }
  if (cityPrices.length === 0) throw new KaspiCabinetError(200, '', `Product ${details?.sku} has no warehouses with stock`);
  return { merchantUid: merchantId, sku: String(details.sku), model: String(details.title ?? ''), cityPrices, availabilities };
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
 * товар в продажу вместо архива. Товар на предзаказе (`preOrder` дней) остаётся
 * на предзаказе: Kaspi не отдаёт предзаказ в details, поэтому он передаётся сюда.
 */
export function buildPriceUpdate(
  details: any,
  merchantId: string,
  cityId: string,
  price: number,
  preOrder: number | null = null,
): PriceUpdatePayload {
  if (!Number.isInteger(price) || price <= 0) throw new RangeError(`Invalid price: ${price}`);

  const cityPrices: PriceUpdatePayload['cityPrices'] = [];
  const availabilities: PriceUpdatePayload['availabilities'] = [];
  const cities: any[] = Array.isArray(details?.cityInfo) ? details.cityInfo : [];
  const enabled = (p: any) => p?.available === true;
  const target = cities.find((c) => String(c?.id) === cityId);
  const targetPoints = (Array.isArray(target?.pickupPoints) ? target.pickupPoints : []).filter(enabled);
  // Снятый с продажи товар: Kaspi оставляет склады «включёнными», но без остатка — новая цена
  // с такими складами вернула бы его в продажу
  if (!preOrder && details?.available === false) {
    throw new KaspiCabinetOutOfStockError(200, '', `Product ${details?.sku} is removed from sale`);
  }
  if (!preOrder && target?.price && targetPoints.length > 0 && !targetPoints.some(hasStock)) {
    throw new KaspiCabinetOutOfStockError(200, '', `Product ${details?.sku} is out of stock in city ${cityId}`);
  }
  for (const city of cities) {
    const points = (Array.isArray(city?.pickupPoints) ? city.pickupPoints : []).filter(preOrder ? enabled : hasStock);
    if (!city?.price || points.length === 0) continue;

    cityPrices.push({ cityId: String(city.id), value: String(city.id) === cityId ? price : Number(city.price) });
    for (const point of points) {
      availabilities.push({
        available: 'yes',
        storeId: String(point.name),
        ...(preOrder
          ? { preOrder, stockEnabled: true, stockCount: preOrderStock(point) }
          : { stockCount: point.stock?.enabled ? Number(point.stock.value ?? 0) : undefined }),
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
  /** Дней предзаказа, если товар сейчас на предзаказе. */
  preOrder: number | null;
  /** Склады, где товар в наличии: остаток (null — без учёта) и предзаказ. */
  stores: StoreState[];
  /** Маленькое фото товара. */
  imageUrl: string | null;
  /** Карточка товара на публичной витрине kaspi.kz. */
  shopUrl: string | null;
}

/**
 * На предзаказе, но на складе появился настоящий остаток: продавец вписал его после
 * поставки, а предзаказ не снял. Остаток PREORDER_STOCK ставим мы сами — он не настоящий.
 */
/** Настоящие остатки по складам { storeId: шт } — без PREORDER_STOCK и пустых складов. */
export function realStocks(offer: CabinetOffer): Record<string, number> {
  return Object.fromEntries(
    offer.stores
      .filter((s) => s.available && s.stockCount !== null && s.stockCount > 0 && s.stockCount !== PREORDER_STOCK)
      .map((s) => [s.storeId, s.stockCount!]),
  );
}

export function isRestockedOnPreOrder(offer: CabinetOffer): boolean {
  return !!offer.preOrder && offer.stores.some((s) => s.available && s.stockCount !== null && s.stockCount > 0 && s.stockCount !== PREORDER_STOCK);
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

  /**
   * Вход по номеру телефона (так же, как вкладка «По номеру» на странице входа):
   * Kaspi отправляет SMS с кодом, его передают в submitSmsCode. Чат с покупателями
   * в кабинете доступен только такому входу. `phone` — 10 цифр без +7.
   * Возвращает номер, на который ушло SMS (Kaspi его маскирует).
   */
  async startPhoneLogin(phone: string): Promise<string> {
    const digits = phone.replace(/\D/g, '').replace(/^[78](?=\d{10}$)/, '');
    if (!/^\d{10}$/.test(digits)) throw new KaspiCabinetError(400, '', 'Номер телефона — 10 цифр после +7.');
    this.trace.length = 0;
    await this.startAuthorization();
    // Как у входа по почте: Kaspi запоминает устройство — без этого вход живёт ровно 6 часов
    const data = await this.postLogin({ _ph: digits, _r_d: true });
    return String(data?.phone ?? digits);
  }

  async submitSmsCode(code: string, merchantId: string): Promise<CabinetLoginResult> {
    const data = await this.postLogin({ _c: code.trim(), _r_d: true });
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

  /**
   * Запрос к чату с покупателями (тот же API, что у окна сообщений в кабинете).
   * Работает только с сессией входа по телефону; иначе Kaspi отвечает INVALID_AUTH_TICKET.
   */
  async chat<T = any>(path: string, body: unknown, merchantId: string): Promise<T> {
    const res = await this.request(`${this.urls.mc}/chats/api/mobile${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://kaspi.kz',
        Referer: this.urls.cabinet,
        'X-App-ID': CHAT_APP_ID,
        'X-Platform-Type': 'WEB',
        'X-Auth-Type': 'Webchat',
        'X-Locale': 'ru-RU',
        'X-Merchant-ID': merchantId,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const json: any = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const code = json?.error?.code ?? res.status;
      const message = `Kaspi chat: ${code}`;
      if (res.status === 401 || res.status === 403) throw new KaspiCabinetAuthError(res.status, text.slice(0, 300), message);
      throw new KaspiCabinetError(res.status, text.slice(0, 300), message);
    }
    return json?.data as T;
  }

  /** Все товары вкладки «В продаже». */
  listActiveOffers(merchantId: string): Promise<CabinetOffer[]> {
    return this.listOffers(merchantId, true);
  }

  /** Все товары вкладки «В продаже» (available) или «Сняты с продажи». */
  async listOffers(merchantId: string, available: boolean): Promise<CabinetOffer[]> {
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
        body: JSON.stringify({ available }),
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
  async updatePrice(merchantId: string, sku: string, cityId: string, price: number, preOrder: number | null = null): Promise<void> {
    await this.uploadOffer(buildPriceUpdate(await this.getOfferDetails(merchantId, sku), merchantId, cityId, price, preOrder));
  }

  /** Ставит товар на предзаказ на `days` дней или снимает предзаказ (null); возвращает ответ Kaspi. */
  async setPreOrder(merchantId: string, sku: string, days: number | null): Promise<string> {
    return this.uploadOffer(buildPreOrderUpdate(await this.getOfferDetails(merchantId, sku), merchantId, days));
  }

  /**
   * Один товар со свежими складами и остатками. Поиска по артикулу у списка кабинета нет
   * (параметр t игнорируется), поэтому список листается: «В продаже», затем «Сняты».
   */
  async getOffer(merchantId: string, sku: string): Promise<CabinetOffer | null> {
    for (const available of [true, false]) {
      const offer = (await this.listOffers(merchantId, available)).find((o) => o.sku === sku);
      if (offer) return offer;
    }
    return null;
  }

  /** Наличие и остатки по складам, при необходимости — и цена в одном городе (правка из таблицы). */
  async updateOffer(merchantId: string, sku: string, stores: StoreState[], price?: { cityId: string; value: number }): Promise<string> {
    return this.uploadOffer(buildOfferUpdate(await this.getOfferDetails(merchantId, sku), merchantId, stores, price));
  }

  /** Снимает предзаказ, оставляя настоящие остатки со складов из списка товаров. */
  async removePreOrder(merchantId: string, offer: CabinetOffer): Promise<string> {
    const stocks = new Map(Object.entries(realStocks(offer)));
    return this.uploadOffer(buildPreOrderRemoval(await this.getOfferDetails(merchantId, offer.sku), merchantId, stocks));
  }

  private async uploadOffer(payload: PriceUpdatePayload): Promise<string> {
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
    return res.text().catch(() => '');
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
  const stores = availabilities
    .filter((a) => a?.storeId)
    .map((a) => ({
      storeId: String(a.storeId),
      available: a.available === 'yes',
      stockCount: a.stockSpecified && a.stockCount != null ? Number(a.stockCount) : null,
      preOrder: a.available === 'yes' && Number(a.preOrder) > 0 ? Number(a.preOrder) : null,
    }));
  const preOrder = Math.max(0, ...stores.map((s) => s.preOrder ?? 0));
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
    preOrder: preOrder > 0 ? preOrder : null,
    stores,
    imageUrl: firstImage(raw),
    shopUrl: typeof raw?.shopLink === 'string' && raw.shopLink.startsWith('/') ? `https://kaspi.kz/shop${raw.shopLink}` : null,
  };
}

/** Маленькое фото товара с CDN Kaspi (imagesV2), иначе собранное из старого поля images. */
function firstImage(raw: any): string | null {
  const v2 = Array.isArray(raw?.imagesV2) ? raw.imagesV2[0] : null;
  if (typeof v2?.small === 'string') return v2.small;
  const path = Array.isArray(raw?.images) ? raw.images[0] : null;
  return typeof path === 'string' ? `https://resources.cdn-kaspi.kz/img/m/p/${path}?format=gallery-small` : null;
}
