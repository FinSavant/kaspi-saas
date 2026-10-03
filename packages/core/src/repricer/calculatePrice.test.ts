import { describe, expect, it } from 'vitest';
import { calculatePrice } from './calculatePrice';

describe('calculatePrice', () => {
  it('undercuts the cheapest competitor by one step', () => {
    const d = calculatePrice({ currentPrice: 10_000, floorPrice: 8_000, step: 1, competitorPrices: [9_500, 9_800] });
    expect(d).toEqual({ price: 9_499, changed: true, reason: 'UNDERCUT' });
  });

  it('never goes below the floor price', () => {
    const d = calculatePrice({ currentPrice: 10_000, floorPrice: 9_000, step: 1, competitorPrices: [8_500] });
    expect(d).toEqual({ price: 9_000, changed: true, reason: 'FLOOR_REACHED' });
  });

  it('stops exactly at the floor when the target equals it', () => {
    const d = calculatePrice({ currentPrice: 10_000, floorPrice: 9_000, step: 10, competitorPrices: [9_010] });
    expect(d.price).toBe(9_000);
    expect(d.reason).toBe('UNDERCUT');
  });

  it('raises the price towards the competitor when a ceiling allows it', () => {
    const d = calculatePrice({
      currentPrice: 9_000, floorPrice: 8_000, ceilingPrice: 12_000, step: 1, competitorPrices: [11_000],
    });
    expect(d).toEqual({ price: 10_999, changed: true, reason: 'RAISED' });
  });

  it('does not raise the price without a ceiling', () => {
    const d = calculatePrice({ currentPrice: 9_000, floorPrice: 8_000, step: 1, competitorPrices: [11_000] });
    expect(d).toEqual({ price: 9_000, changed: false, reason: 'ALREADY_BEST' });
  });

  it('caps the price at the ceiling', () => {
    const d = calculatePrice({
      currentPrice: 9_000, floorPrice: 8_000, ceilingPrice: 10_000, step: 1, competitorPrices: [15_000],
    });
    expect(d.price).toBe(10_000);
  });

  it('goes to the ceiling when there are no competitors', () => {
    const d = calculatePrice({
      currentPrice: 9_000, floorPrice: 8_000, ceilingPrice: 10_000, step: 1, competitorPrices: [],
    });
    expect(d).toEqual({ price: 10_000, changed: true, reason: 'NO_COMPETITORS' });
  });

  it('keeps the price when there are no competitors and no ceiling', () => {
    const d = calculatePrice({ currentPrice: 9_000, floorPrice: 8_000, step: 1, competitorPrices: [] });
    expect(d).toEqual({ price: 9_000, changed: false, reason: 'NO_COMPETITORS' });
  });

  it('lifts a price that is already below the floor back to the floor', () => {
    const d = calculatePrice({ currentPrice: 7_000, floorPrice: 8_000, step: 1, competitorPrices: [7_500] });
    expect(d).toEqual({ price: 8_000, changed: true, reason: 'FLOOR_REACHED' });
  });

  it('reports no change when already one step below the cheapest competitor', () => {
    const d = calculatePrice({ currentPrice: 9_499, floorPrice: 8_000, step: 1, competitorPrices: [9_500] });
    expect(d).toEqual({ price: 9_499, changed: false, reason: 'ALREADY_BEST' });
  });

  it('rejects invalid settings', () => {
    expect(() => calculatePrice({ currentPrice: 100, floorPrice: 0, step: 1, competitorPrices: [] })).toThrow(RangeError);
    expect(() => calculatePrice({ currentPrice: 100, floorPrice: 50, step: 0, competitorPrices: [] })).toThrow(RangeError);
    expect(() =>
      calculatePrice({ currentPrice: 100, floorPrice: 50, ceilingPrice: 40, step: 1, competitorPrices: [] }),
    ).toThrow(RangeError);
  });
});
