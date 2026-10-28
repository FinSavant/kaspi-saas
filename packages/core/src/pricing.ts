/** Минимальная прибыль, которую должна оставлять цена товара, — доля от цены. */
export const MIN_MARGIN = 0.05;

/** НДС, который Kaspi начисляет сверху на тариф доставки. */
const DELIVERY_VAT = 0.16;

/**
 * Тариф «Сервис Kaspi Доставка» с 1 января 2026 года, ₸ без НДС: ступени по сумме
 * заказа, для заказов от 10 000 ₸ — по весу. Из ступени берётся самый дорогой
 * столбец (по городу / по Казахстану / Express), чтобы и экспресс-заказ давал
 * нужную прибыль. Источник — «Информация о стоимости услуг к Договору с Kaspi Магазином».
 */
export const KASPI_DELIVERY_TARIFF_2026: { from: number; to: number; fee: number }[] = [
  { from: 0, to: 1000, fee: 49.14 },
  { from: 1000, to: 3000, fee: 149.14 },
  { from: 3000, to: 5000, fee: 199.14 },
  { from: 5000, to: 10000, fee: 799.14 },
  // От 10 000 ₸ тариф зависит от веса — см. KASPI_HEAVY_TARIFF_2026
  { from: 10000, to: Infinity, fee: NaN },
];

/** Заказы от 10 000 ₸: ступени по весу (до `upToKg` включительно), самый дорогой столбец. */
export const KASPI_HEAVY_TARIFF_2026: { upToKg: number; fee: number }[] = [
  { upToKg: 5, fee: 1699.14 },
  { upToKg: 15, fee: 1849.14 },
  { upToKg: 30, fee: 3599.14 },
  { upToKg: 60, fee: 5649.14 },
  { upToKg: 100, fee: 8549.14 },
  { upToKg: Infinity, fee: 11999.14 },
];

/**
 * Доставка за счёт продавца по тарифу Kaspi для заказа на сумму `orderTotal`, ₸ с НДС.
 * `weightKg` нужен для заказов от 10 000 ₸; неизвестный вес считается «до 5 кг».
 */
export function kaspiDeliveryFee(orderTotal: number, weightKg: number | null = null): number {
  const step = KASPI_DELIVERY_TARIFF_2026.find((s) => orderTotal >= s.from && orderTotal < s.to)!;
  const fee = Number.isNaN(step.fee) ? KASPI_HEAVY_TARIFF_2026.find((s) => (weightKg ?? 0) <= s.upToKg)!.fee : step.fee;
  return Math.round(fee * (1 + DELIVERY_VAT));
}

export interface MinPriceInput {
  /** Себестоимость единицы, ₸. */
  costPrice: number;
  /** Комиссия категории Kaspi без НДС, %. */
  commissionPercent: number;
  /** НДС на комиссию, %. */
  commissionVatPercent: number;
  /** Kaspi Pay от суммы продажи, %. */
  paymentFeePercent: number;
  /** Налог продавца от выручки, %. */
  taxPercent?: number;
  /** Нужная прибыль от цены, доля (0.05 — 5%). */
  margin?: number;
  /** Вес товара, кг — для тарифа заказов от 10 000 ₸; null — «до 5 кг». */
  weightKg?: number | null;
}

export interface MinPrice {
  price: number;
  /** Доставка по тарифу при этой цене (заказ из одной штуки), ₸. */
  delivery: number;
}

/**
 * Цена, ниже которой прибыль меньше `margin` от цены — та же модель, что в аналитике:
 * прибыль = цена − себестоимость − комиссия − НДС на комиссию − Kaspi Pay − налог − доставка.
 * Доставка зависит от самой цены (ступени тарифа), поэтому для каждой ступени решается
 * цена × (1 − комиссия × (1 + НДС) − Kaspi Pay − margin) = себестоимость + доставка ступени,
 * и берётся наименьшая цена, попавшая в свою ступень. Заказ — одна штука товара.
 * null — при таких удержаниях прибыль недостижима.
 */
export function minProfitablePrice(input: MinPriceInput): MinPrice | null {
  const share =
    1 -
    (input.commissionPercent / 100) * (1 + input.commissionVatPercent / 100) -
    input.paymentFeePercent / 100 -
    (input.taxPercent ?? 0) / 100 -
    (input.margin ?? MIN_MARGIN);
  if (share <= 0) return null;
  for (const step of KASPI_DELIVERY_TARIFF_2026) {
    const delivery = kaspiDeliveryFee(step.from, input.weightKg ?? null);
    const price = Math.max(step.from, Math.ceil((input.costPrice + delivery) / share));
    if (price < step.to) return { price, delivery };
  }
  return null;
}
