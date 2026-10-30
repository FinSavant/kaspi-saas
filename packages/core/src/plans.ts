/**
 * Тарифы SANQ. Цены в тенге за месяц, оплата вручную через WhatsApp владельца.
 * Лимит робота — сколько товаров одновременно может быть под управлением робота цен,
 * лимит предзаказа — сколько товаров одновременно на автопредзаказе.
 * «Только отзывы» и «Только аналитика» открывают одну вкладку.
 */
export type PlanId = 'start' | 'pro' | 'reviews' | 'analytics';

/** Разделы кабинета, которые открывает тариф. Главная, Тарифы и Настройки открыты всегда. */
export type Feature = 'products' | 'waybills' | 'picking' | 'robot' | 'reviews' | 'analytics';
export const ALL_FEATURES: Feature[] = ['products', 'waybills', 'picking', 'robot', 'reviews', 'analytics'];

export interface Plan {
  id: PlanId;
  name: string;
  pricePerMonth: number;
  maxShops: number;
  maxRobotProducts: number;
  maxPreorderProducts: number;
  features: Feature[];
  /** Рассылка просьб об отзыве входит в тариф; иначе — доплата REVIEWS_ADDON_PRICE (только «Старт») */
  reviewsIncluded: boolean;
  /** Тариф на один раздел — показывается отдельным блоком */
  single?: boolean;
}

export const PLANS: Plan[] = [
  {
    id: 'start',
    name: 'Старт',
    pricePerMonth: 9_900,
    maxShops: 1,
    maxRobotProducts: 50,
    maxPreorderProducts: 50,
    // Отзывы — отдельный блок: тариф «Только отзывы» или доплата к «Старту» (reviewsAddon)
    features: ['products', 'waybills', 'picking', 'robot', 'analytics'],
    reviewsIncluded: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    pricePerMonth: 15_900,
    maxShops: 2,
    maxRobotProducts: 120,
    maxPreorderProducts: 120,
    features: ALL_FEATURES,
    reviewsIncluded: true,
  },
  {
    id: 'reviews',
    name: 'Только отзывы',
    pricePerMonth: 4_999,
    maxShops: 1,
    maxRobotProducts: 0,
    maxPreorderProducts: 0,
    features: ['reviews'],
    reviewsIncluded: true,
    single: true,
  },
  {
    id: 'analytics',
    name: 'Только аналитика',
    pricePerMonth: 5_990,
    maxShops: 1,
    maxRobotProducts: 0,
    maxPreorderProducts: 0,
    features: ['analytics'],
    reviewsIncluded: false,
    single: true,
  },
];

export const REVIEWS_ADDON_PRICE = 4_999;
export const TRIAL_DAYS = 3;

export function getPlan(id: string): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0]!;
}

export interface SubscriptionLike {
  plan: string;
  reviewsAddon: boolean;
  trialEndsAt: Date | null;
  paidUntil: Date | null;
}

export interface SubscriptionState {
  plan: Plan;
  /** trial — пробный период, paid — оплачен, expired — доступ закрыт */
  status: 'trial' | 'paid' | 'expired';
  /** До какого момента открыт доступ (конец оплаты или пробного периода) */
  activeUntil: Date | null;
  reviewsAllowed: boolean;
  /** Открытые разделы: в пробный период — все */
  features: Feature[];
  /** Сумма к оплате за месяц с учётом доплаты за отзывы */
  monthlyPrice: number;
}

export function subscriptionState(sub: SubscriptionLike, now = new Date()): SubscriptionState {
  const plan = getPlan(sub.plan);
  const paid = sub.paidUntil && sub.paidUntil > now;
  const trial = !paid && sub.trialEndsAt && sub.trialEndsAt > now;
  const status = paid ? 'paid' : trial ? 'trial' : 'expired';
  const addon = !plan.reviewsIncluded && sub.reviewsAddon;
  return {
    plan,
    status,
    activeUntil: paid ? sub.paidUntil : trial ? sub.trialEndsAt : (sub.paidUntil ?? sub.trialEndsAt),
    // В пробный период открыто всё, чтобы продавец попробовал и отзывы
    reviewsAllowed: status === 'trial' || (status === 'paid' && (plan.reviewsIncluded || addon)),
    features: status === 'trial' ? ALL_FEATURES : plan.features.includes('reviews') || addon ? [...new Set<Feature>([...plan.features, 'reviews'])] : plan.features,
    monthlyPrice: plan.pricePerMonth + (addon ? REVIEWS_ADDON_PRICE : 0),
  };
}

export interface OwnerAccess {
  /** Доступ открыт: оплачено, пробный период или владелец платформы */
  active: boolean;
  reviewsAllowed: boolean;
  features: Feature[];
  maxShops: number;
  maxRobotProducts: number;
  maxPreorderProducts: number;
}

/** Что разрешено продавцу сейчас. Без подписки доступа нет; владельцу платформы — всё. */
export function ownerAccess(owner: { isAdmin: boolean; subscription: SubscriptionLike | null }, now = new Date()): OwnerAccess {
  if (owner.isAdmin) {
    return { active: true, reviewsAllowed: true, features: ALL_FEATURES, maxShops: Infinity, maxRobotProducts: Infinity, maxPreorderProducts: Infinity };
  }
  if (!owner.subscription) {
    return { active: false, reviewsAllowed: false, features: [], maxShops: 0, maxRobotProducts: 0, maxPreorderProducts: 0 };
  }
  const state = subscriptionState(owner.subscription, now);
  return {
    active: state.status !== 'expired',
    reviewsAllowed: state.reviewsAllowed,
    features: state.features,
    maxShops: state.plan.maxShops,
    // В пробный период лимиты — как у тарифа, на который продавец записан (по умолчанию «Старт»)
    maxRobotProducts: state.status === 'trial' ? Math.max(state.plan.maxRobotProducts, getPlan('start').maxRobotProducts) : state.plan.maxRobotProducts,
    maxPreorderProducts:
      state.status === 'trial' ? Math.max(state.plan.maxPreorderProducts, getPlan('start').maxPreorderProducts) : state.plan.maxPreorderProducts,
  };
}
