import { describe, expect, it } from 'vitest';
import { ownerAccess, subscriptionState } from './plans';

const NOW = new Date('2026-11-01T12:00:00Z');
const later = new Date('2026-12-01T00:00:00Z');
const earlier = new Date('2026-10-01T00:00:00Z');
const sub = (plan: string, extra: Partial<{ reviewsAddon: boolean; trialEndsAt: Date | null; paidUntil: Date | null }> = {}) => ({
  plan,
  reviewsAddon: false,
  trialEndsAt: null,
  paidUntil: later,
  ...extra,
});

describe('plans', () => {
  it('opens only the paid section on single-section plans', () => {
    expect(ownerAccess({ isAdmin: false, subscription: sub('reviews') }, NOW)).toMatchObject({
      active: true,
      reviewsAllowed: true,
      features: ['reviews'],
      maxRobotProducts: 0,
    });
    expect(ownerAccess({ isAdmin: false, subscription: sub('analytics') }, NOW).features).toEqual(['analytics']);
  });

  it('keeps reviews out of «Старт» unless added separately', () => {
    expect(ownerAccess({ isAdmin: false, subscription: sub('start') }, NOW)).toMatchObject({ reviewsAllowed: false });
    expect(ownerAccess({ isAdmin: false, subscription: sub('start') }, NOW).features).not.toContain('reviews');
    expect(ownerAccess({ isAdmin: false, subscription: sub('start', { reviewsAddon: true }) }, NOW).features).toContain('reviews');
    expect(subscriptionState(sub('start', { reviewsAddon: true }), NOW).monthlyPrice).toBe(9_900 + 5_990);
  });

  it('limits preorder by plan and opens everything during the trial', () => {
    expect(ownerAccess({ isAdmin: false, subscription: sub('start') }, NOW).maxPreorderProducts).toBe(50);
    expect(ownerAccess({ isAdmin: false, subscription: sub('pro') }, NOW).maxPreorderProducts).toBe(120);
    const trial = ownerAccess({ isAdmin: false, subscription: sub('start', { paidUntil: null, trialEndsAt: later }) }, NOW);
    expect(trial.features).toHaveLength(6);
    expect(trial.reviewsAllowed).toBe(true);
  });

  it('closes access after the paid period and falls back to «Старт» for an unknown plan', () => {
    expect(ownerAccess({ isAdmin: false, subscription: sub('pro', { paidUntil: earlier }) }, NOW).active).toBe(false);
    expect(subscriptionState(sub('business'), NOW).plan.id).toBe('start');
  });
});
