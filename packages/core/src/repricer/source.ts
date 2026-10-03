export interface CompetitorOffer {
  merchantId: string;
  merchantName?: string;
  /** Артикул товара у этого продавца. */
  merchantSku?: string;
  price: number;
}

export interface CompetitorQuery {
  /** Код общей карточки товара на Kaspi (число в конце ссылки на карточку). */
  masterSku: string;
  cityId: string;
}

/**
 * Источник цен всех продавцов по карточке товара. Воркер зависит только от
 * этого интерфейса; боевая реализация — KaspiStorefrontPriceSource.
 */
export interface CompetitorPriceSource {
  getOffers(query: CompetitorQuery): Promise<CompetitorOffer[]>;
}

/** Тестовый источник: отдаёт заранее заданные предложения по коду карточки. */
export class MockCompetitorPriceSource implements CompetitorPriceSource {
  constructor(private readonly offersByMasterSku: Record<string, CompetitorOffer[]> = {}) {}

  async getOffers(query: CompetitorQuery): Promise<CompetitorOffer[]> {
    return this.offersByMasterSku[query.masterSku] ?? [];
  }
}
