// Клиент официального Kaspi Merchant API (токен из кабинета продавца).
// Заказы, позиции заказов и накладные проверены на живом магазине.

const DEFAULT_BASE_URL = 'https://kaspi.kz/shop/api/v2';
const MAX_PAGE_SIZE = 100;
/** Kaspi принимает фильтр по дате создания не шире 14 дней. */
const MAX_RANGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface KaspiOrder {
  id: string;
  code: string;
  state: string;
  /** COMPLETED, CANCELLED, ACCEPTED_BY_MERCHANT и т. д. */
  status: string;
  totalPrice: number;
  /** Доставка, которую платит покупатель. */
  deliveryCost: number;
  /** Доставка, которую Kaspi удерживает с продавца. */
  deliveryCostForSeller: number;
  city: string | null;
  waybillUrl: string | null;
  /** Продавец отметил заказ собранным (вышел из «Упаковки»). */
  assembled: boolean;
  /** Когда заказ фактически передан курьеру; null — ещё не передан. */
  courierTransmissionDate: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  /** DELIVERY_PICKUP, DELIVERY_LOCAL, DELIVERY_REGIONAL_TODOOR и т. д. */
  deliveryMode: string | null;
  /** PREPAID, PAY_WITH_CREDIT и т. д. */
  paymentMode: string | null;
  isKaspiDelivery: boolean;
  express: boolean;
}

/** Позиция заказа. */
export interface KaspiOrderEntry {
  /** Артикул продавца. */
  sku: string;
  name: string;
  quantity: number;
  /** Цена за единицу. */
  basePrice: number;
  /** Сумма по позиции. */
  totalPrice: number;
  categoryCode: string | null;
  categoryTitle: string | null;
}

const CANCEL_STATUSES = new Set(['CANCELLING', 'CANCELLED', 'KASPI_DELIVERY_RETURN_REQUESTED', 'RETURNED']);

/**
 * Заказ во вкладке «Передача» кабинета Kaspi: собран, накладная сформирована,
 * но курьеру ещё не передан. Только такие заказы идут в склейку накладных.
 * Признаки определены по ответам API живого магазина: у «Упаковки»
 * assembled=false и нет накладной, у «Переданы в доставку» заполнена
 * courierTransmissionDate.
 */
export function isAwaitingHandover(order: KaspiOrder): boolean {
  return (
    order.state === 'KASPI_DELIVERY' &&
    order.assembled &&
    order.waybillUrl !== null &&
    order.courierTransmissionDate === null &&
    !CANCEL_STATUSES.has(order.status)
  );
}

export interface ListOrdersParams {
  state: string;
  from: Date;
  to?: Date;
}

export class KaspiApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Kaspi API responded with ${status}`);
  }
}

export class KaspiClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * Все заказы в заданном состоянии за период, со всех страниц. Период
   * длиннее 14 дней запрашивается кусками — шире Kaspi не принимает.
   */
  async listOrders(params: ListOrdersParams): Promise<KaspiOrder[]> {
    const orders = new Map<string, KaspiOrder>();
    const end = (params.to ?? new Date()).getTime();

    for (let from = params.from.getTime(); from < end; from += MAX_RANGE_MS) {
      const to = Math.min(from + MAX_RANGE_MS - 1, end);
      for (let page = 0; ; page++) {
        const query = new URLSearchParams({
          'page[number]': String(page),
          'page[size]': String(MAX_PAGE_SIZE),
          'filter[orders][state]': params.state,
          'filter[orders][creationDate][$ge]': String(from),
          'filter[orders][creationDate][$le]': String(to),
        });
        const body = await this.getJson(`/orders?${query}`);
        const data: any[] = Array.isArray(body?.data) ? body.data : [];
        for (const order of data.map(mapOrder)) orders.set(order.id, order);
        if (data.length < MAX_PAGE_SIZE) break;
      }
    }
    return [...orders.values()];
  }

  /** Позиции заказа: товары, количество и цены. */
  async getOrderEntries(orderId: string): Promise<KaspiOrderEntry[]> {
    const body = await this.getJson(`/orders/${encodeURIComponent(orderId)}/entries`);
    const data: any[] = Array.isArray(body?.data) ? body.data : [];
    return data.map((raw) => {
      const e = raw?.attributes ?? {};
      return {
        sku: String(e.offer?.code ?? ''),
        name: String(e.offer?.name ?? ''),
        quantity: Number(e.quantity ?? 0),
        basePrice: Math.round(Number(e.basePrice ?? 0)),
        totalPrice: Math.round(Number(e.totalPrice ?? 0)),
        categoryCode: e.category?.code ?? null,
        categoryTitle: e.category?.title ?? null,
      };
    });
  }

  async downloadWaybill(url: string): Promise<Uint8Array> {
    const res = await this.fetchImpl(url, { headers: { 'X-Auth-Token': this.token } });
    if (!res.ok) throw new KaspiApiError(res.status, await res.text());
    return new Uint8Array(await res.arrayBuffer());
  }

  private async getJson(path: string): Promise<any> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: {
        'X-Auth-Token': this.token,
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/vnd.api+json',
      },
    });
    if (!res.ok) throw new KaspiApiError(res.status, await res.text());
    return res.json();
  }
}

function mapOrder(raw: any): KaspiOrder {
  const a = raw?.attributes ?? {};
  return {
    id: String(raw?.id),
    code: String(a.code),
    state: String(a.state),
    status: String(a.status),
    totalPrice: Math.round(Number(a.totalPrice ?? 0)),
    deliveryCost: Math.round(Number(a.deliveryCost ?? 0)),
    deliveryCostForSeller: Math.round(Number(a.deliveryCostForSeller ?? 0)),
    city: a.deliveryAddress?.town ?? null,
    waybillUrl: a.kaspiDelivery?.waybill || null,
    assembled: a.assembled === true,
    courierTransmissionDate: a.kaspiDelivery?.courierTransmissionDate
      ? new Date(Number(a.kaspiDelivery.courierTransmissionDate))
      : null,
    createdAt: new Date(Number(a.creationDate)),
    completedAt: a.completionDate ? new Date(Number(a.completionDate)) : null,
    deliveryMode: a.deliveryMode ?? null,
    paymentMode: a.paymentMode ?? null,
    isKaspiDelivery: a.isKaspiDelivery === true,
    express: a.kaspiDelivery?.express === true,
  };
}
