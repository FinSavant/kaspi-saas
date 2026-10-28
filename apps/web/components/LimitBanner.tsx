import Link from 'next/link';
import type { Billing } from './Plans';

/** Плашка «увеличьте лимит», когда занято 100% товаров под роботом или на предзаказе. */
export function LimitBanner({ b, shopId }: { b: Billing; shopId: string }) {
  if (b.isAdmin) return null;
  const plan = b.plans.find((p) => p.id === b.plan) ?? b.plans[0]!;
  const full = [
    // Магазины здесь не считаем: на «Старте» один магазин — это всегда 100%, плашка висела бы постоянно.
    // Лимит магазинов показывается при попытке подключить ещё один
    plan.maxRobotProducts > 0 && b.usage.robotProducts >= plan.maxRobotProducts && `товаров под роботом ${b.usage.robotProducts} из ${plan.maxRobotProducts}`,
    plan.maxPreorderProducts > 0 && b.usage.preorderProducts >= plan.maxPreorderProducts && `на предзаказе ${b.usage.preorderProducts} из ${plan.maxPreorderProducts}`,
  ].filter(Boolean);
  if (full.length === 0) return null;
  const upgrades = b.plans.filter((p) => !p.single && p.pricePerMonth > plan.pricePerMonth).map((p) => `«${p.name}»`);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
      <span>
        Лимит тарифа «{plan.name}» исчерпан: {full.join(', ')}.
        {upgrades.length > 0 && ` Перейдите на ${upgrades.join(' или ')}, чтобы добавить больше.`}
      </span>
      <Link href={`/shops/${shopId}/billing`} className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700">
        Увеличить лимит
      </Link>
    </div>
  );
}
