import { describe, expect, it } from 'vitest';
import { kaspiDeliveryFee, minProfitablePrice } from './pricing';

const fees = { commissionPercent: 10.9, commissionVatPercent: 16, paymentFeePercent: 0.95 };
const profitShare = (price: number, cost: number) =>
  (price - cost - kaspiDeliveryFee(price) - price * 0.109 * 1.16 - price * 0.0095) / price;

describe('kaspiDeliveryFee', () => {
  it('matches what Kaspi actually charged on real orders (tariff + 16% VAT)', () => {
    expect(kaspiDeliveryFee(1559)).toBe(173);
    expect(kaspiDeliveryFee(3500)).toBe(231);
    expect(kaspiDeliveryFee(6957)).toBe(927); // столбец Express: 799,14 × 1,16
  });
});

describe('minProfitablePrice', () => {
  it('leaves at least 5% profit at the threshold and less one tenge below it', () => {
    const { price } = minProfitablePrice({ costPrice: 280, ...fees })!;
    expect(profitShare(price, 280)).toBeGreaterThanOrEqual(0.05);
    expect(profitShare(price - 1, 280)).toBeLessThan(0.05);
  });

  it('jumps over a delivery step when the cheaper step cannot be profitable', () => {
    // Себестоимость 4 000: внутри ступени 3–5 тыс. 5% не набрать, в ступени 5–10 тыс. доставка дороже
    const result = minProfitablePrice({ costPrice: 4000, ...fees })!;
    expect(result.price).toBeGreaterThanOrEqual(5000);
    expect(result.delivery).toBe(927);
    expect(profitShare(result.price, 4000)).toBeGreaterThanOrEqual(0.05);
  });

  it('uses the weight step for orders from 10 000 tenge', () => {
    expect(kaspiDeliveryFee(55000, 12)).toBe(2145); // 5–15 кг: 1849,14 × 1,16
    expect(kaspiDeliveryFee(55000, null)).toBe(1971); // вес неизвестен — «до 5 кг»
    const heavy = minProfitablePrice({ costPrice: 30000, ...fees, weightKg: 12 })!;
    expect(heavy.delivery).toBe(2145);
  });

  it('returns null when fees eat the whole price', () => {
    expect(minProfitablePrice({ costPrice: 100, commissionPercent: 90, commissionVatPercent: 16, paymentFeePercent: 1 })).toBeNull();
  });
});
