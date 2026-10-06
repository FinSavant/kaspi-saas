import type { WaybillLayout } from './pdf/mergeWaybills';

export const QUEUES = {
  repricer: 'repricer',
  ordersSync: 'orders-sync',
  waybills: 'waybills',
  productsSync: 'products-sync',
  reports: 'reports',
  preorder: 'preorder',
  offerEdit: 'offer-edit',
  reviews: 'reviews',
} as const;

/** Правка товара из таблицы «Робот»: цена или склад (остаток / наличие). */
export type OfferEditJob =
  | { productId: string; kind: 'price'; value: number }
  | { productId: string; kind: 'stock'; storeId: string; value: number | null }
  | { productId: string; kind: 'availability'; storeId: string; value: boolean };

/** Ежедневный отчёт в Telegram; без chatId — всем привязанным чатам. */
export interface ReportJob {
  chatId?: string;
}

export interface ProductsSyncJob {
  shopId: string;
}

/** Пустой productId означает «тик планировщика»: поставить в очередь все товары, которым пора. */
export interface RepricerJob {
  productId?: string;
}

export interface OrdersSyncJob {
  shopId: string;
}

export interface WaybillsJob {
  shopId: string;
  layout: WaybillLayout;
  /** Если задан, готовый PDF отправляется в этот чат Telegram. */
  telegramChatId?: string;
  /**
   * Пересобрать уже склеенный пакет в другом формате: те же заказы,
   * без проверки «уже напечатано» и без новых отметок о печати.
   */
  reprintBatchId?: string;
  /** Порядок накладных в файле. */
  sort?: WaybillSort;
  /** Только заказы, которые ещё не печатались (по умолчанию — да). */
  onlyNew?: boolean;
  excludeExpress?: boolean;
  /** Только заказы, созданные в этот период (ISO-даты). */
  createdFrom?: string;
  createdTo?: string;
  /** Если заданы — печатать только заказы с этими городами / товарами / кодами. */
  cities?: string[];
  skus?: string[];
  orderCodes?: string[];
}

export type WaybillSort = 'none' | 'product' | 'product_city';

/** Параметры подключения BullMQ из REDIS_URL. */
export function redisConnectionFromUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
