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
