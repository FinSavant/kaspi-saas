import type { CompetitorOffer, CompetitorPriceSource, CompetitorQuery } from './source';

/**
 * Цены конкурентов, присланные «читателем цен» с компьютера продавца, когда
 * сервер сам не может обращаться к витрине Kaspi. Хранятся в Redis.
 */
export interface OffersSnapshot {
  /** Когда цены прочитаны, ISO. */
  at: string;
  offers: CompetitorOffer[];
}

/** Сколько живёт снимок цен: старше — не используется для решений. */
export const SNAPSHOT_TTL_SEC = 5 * 60;

export const snapshotKey = (q: CompetitorQuery) => `competitor-offers:${q.masterSku}:${q.cityId}`;

/** Свежего снимка нет — читатель цен не запущен или ещё не дошёл до карточки. */
export class OffersNotReadyError extends Error {
  constructor(masterSku: string) {
    super(`No fresh competitor prices for card ${masterSku}: price reader is not running`);
  }
}

/** Минимум от клиента Redis, который нужен источнику (ioredis из BullMQ подходит). */
export interface SnapshotStore {
  get(key: string): Promise<string | null>;
}

export class SnapshotPriceSource implements CompetitorPriceSource {
  constructor(private readonly store: SnapshotStore) {}

  async getOffers(query: CompetitorQuery): Promise<CompetitorOffer[]> {
    const raw = await this.store.get(snapshotKey(query));
    if (!raw) throw new OffersNotReadyError(query.masterSku);
    return (JSON.parse(raw) as OffersSnapshot).offers;
  }
}

/** Когда читатель цен на компьютере продавца последний раз прислал цены (мс, строкой). */
export const READER_LAST_SEEN_KEY = 'reader:last-seen';
/** Цены не приходили дольше этого — робот стоит. */
export const READER_STALE_MS = 15 * 60_000;

/**
 * Предупреждение, если читатель цен молчит: без свежих цен конкурентов робот цены не меняет.
 * null — всё в порядке.
 */
export function readerWarning(lastSeen: number | null, now = Date.now()): string | null {
  if (lastSeen !== null && now - lastSeen <= READER_STALE_MS) return null;
  const since =
    lastSeen === null
      ? 'ещё ни разу не приходили'
      : `не приходят с ${new Date(lastSeen).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
  return `⚠️ Робот стоит: цены конкурентов ${since}. Включите компьютер и запустите start-price-reader.cmd.`;
}
