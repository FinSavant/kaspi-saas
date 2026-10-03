export type PriceDecisionReason =
  | 'NO_COMPETITORS'
  | 'UNDERCUT'
  | 'RAISED'
  | 'FLOOR_REACHED'
  | 'ALREADY_BEST';

export interface PriceInput {
  currentPrice: number;
  /** Ниже этой цены не опускаемся никогда. */
  floorPrice: number;
  /** Выше этой цены не поднимаемся. Если не задана, цена не повышается. */
  ceilingPrice?: number | null;
  /** Шаг, на который обходим самого дешёвого конкурента. */
  step: number;
  /** Цены других продавцов на ту же карточку (без нашей). */
  competitorPrices: number[];
}

export interface PriceDecision {
  price: number;
  changed: boolean;
  reason: PriceDecisionReason;
}

/**
 * Считает цену для первого места в карточке: на `step` ниже самого дешёвого
 * конкурента, но в пределах [floorPrice, ceilingPrice].
 */
export function calculatePrice(input: PriceInput): PriceDecision {
  const { currentPrice, floorPrice, step, competitorPrices } = input;

  for (const [name, value] of Object.entries({ currentPrice, floorPrice, step })) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive integer, got ${value}`);
    }
  }
  if (input.ceilingPrice != null && input.ceilingPrice < floorPrice) {
    throw new RangeError('ceilingPrice must not be lower than floorPrice');
  }

  const upper = input.ceilingPrice ?? Math.max(currentPrice, floorPrice);
  const competitors = competitorPrices.filter((p) => Number.isFinite(p) && p > 0);

  const decide = (price: number, reason: PriceDecisionReason): PriceDecision => ({
    price,
    changed: price !== currentPrice,
    reason: price === currentPrice && reason !== 'FLOOR_REACHED' && reason !== 'NO_COMPETITORS'
      ? 'ALREADY_BEST'
      : reason,
  });

  if (competitors.length === 0) {
    return decide(upper, 'NO_COMPETITORS');
  }

  const target = Math.min(...competitors) - step;
  if (target < floorPrice) {
    return decide(floorPrice, 'FLOOR_REACHED');
  }

  const price = Math.min(target, upper);
  return decide(price, price > currentPrice ? 'RAISED' : 'UNDERCUT');
}
