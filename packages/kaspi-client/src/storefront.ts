import type { CompetitorOffer, CompetitorPriceSource, CompetitorQuery } from '@kaspi/core';

const DEFAULT_BASE_URL = 'https://kaspi.kz';
const OFFERS_PAGE_SIZE = 50;
const MAX_OFFER_PAGES = 20;

export interface StorefrontOptions {
  baseUrl?: string;
  /** Минимальная пауза между запросами к витрине, мс. */
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
}

/** Диагностика ответа с ошибкой: адрес, безопасные заголовки и начало тела (без cookie и токенов). */
export interface StorefrontErrorInfo {
  url: string;
  redirected: boolean;
  server?: string;
  allow?: string;
  contentType?: string;
  location?: string;
  snippet: string;
}

const SNIPPET_LIMIT = 200;

export function describeErrorResponse(res: Response, body: string): StorefrontErrorInfo {
  const header = (name: string) => res.headers.get(name) ?? undefined;
  return {
    url: res.url,
    redirected: res.redirected,
    server: header('server'),
    allow: header('allow'),
    contentType: header('content-type'),
    location: header('location'),
    snippet: body
      .replace(/s+/g, ' ')
      .trim()
      .slice(0, SNIPPET_LIMIT)
      .replace(/[A-Za-z0-9_-]{32,}/g, '[скрыто]'),
  };
}

export class KaspiStorefrontError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly info?: StorefrontErrorInfo,
  ) {
    super(`Kaspi storefront responded with ${status}`);
  }
}

/** Код товара из ссылки на карточку: .../shop/p/nazvanie-102047085/ → 102047085. */
export function masterSkuFromUrl(url: string): string | null {
  return /\/shop\/p\/(?:[^/?#]*-)?(\d+)\/?(?:[?#]|$)/.exec(url)?.[1] ?? null;
}

/**
 * Цены продавцов с публичной карточки товара Kaspi. Использует тот же запрос,
 * которым карточка загружает блок «Продавцы». Это не официальный API: Kaspi
 * может изменить или закрыть его без предупреждения.
 */
export class KaspiStorefrontPriceSource implements CompetitorPriceSource {
  private readonly baseUrl: string;
  private readonly minIntervalMs: number;
  private readonly fetchImpl: typeof fetch;
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(options: StorefrontOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.minIntervalMs = options.minIntervalMs ?? 1_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Цены всех продавцов по карточке товара, от дешёвых к дорогим. */
  async getOffers(query: CompetitorQuery): Promise<CompetitorOffer[]> {
    const offers: CompetitorOffer[] = [];

    for (let page = 0; page < MAX_OFFER_PAGES; page++) {
      const body = await this.request(`/yml/offer-view/offers/${query.masterSku}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          Referer: `${this.baseUrl}/shop/p/-${query.masterSku}/`,
        },
        body: JSON.stringify({
          cityId: query.cityId,
          id: query.masterSku,
          merchantUUID: [],
          limit: OFFERS_PAGE_SIZE,
          page,
          sortOption: 'PRICE',
          installationId: '-1',
        }),
      });
      const raw: any[] = Array.isArray(body?.offers) ? body.offers : [];
      offers.push(...raw.map(mapOffer).filter((o) => o.price > 0));

      if (raw.length === 0 || offers.length >= Number(body?.total ?? 0)) break;
    }
    return offers;
  }

  /** Запросы идут строго по одному, с паузой не меньше minIntervalMs. */
  private request(path: string, init: RequestInit): Promise<any> {
    const run = this.queue.then(async () => {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastRequestAt = Date.now();

      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { Accept: 'application/json, text/*', ...init.headers },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new KaspiStorefrontError(res.status, text, describeErrorResponse(res, text));
      }
      return res.json();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function mapOffer(raw: any): CompetitorOffer {
  return {
    merchantId: String(raw?.merchantId),
    merchantName: raw?.merchantName ?? undefined,
    merchantSku: raw?.merchantSku != null ? String(raw.merchantSku) : undefined,
    price: Math.round(Number(raw?.price ?? 0)),
  };
}
