'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Feature } from './Plans';

/** Раздел страницы → что должно входить в тариф. Главная, Тарифы и Настройки открыты всегда. */
const SECTION_FEATURE: Record<string, Feature> = {
  products: 'products',
  waybills: 'waybills',
  picking: 'picking',
  robot: 'robot',
  reviews: 'reviews',
  analytics: 'analytics',
};

/**
 * Закрывает раздел, которого нет в тарифе. Проверка по адресу в браузере: макет магазина
 * не перерисовывается при переходах между его страницами, а этот компонент — да.
 */
export function FeatureGate({ shopId, features, children }: { shopId: string; features: Feature[]; children: ReactNode }) {
  const section = usePathname().split('/')[3] ?? '';
  const needed = SECTION_FEATURE[section];
  if (!needed || features.includes(needed)) return <>{children}</>;
  return (
    <div className="max-w-xl rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-bold">Раздел не входит в ваш тариф</h1>
      <p className="mt-2 text-sm text-slate-600">Чтобы открыть его, выберите подходящий тариф на вкладке «Тарифы».</p>
      <Link href={`/shops/${shopId}/billing`} className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
        Выбрать тариф
      </Link>
    </div>
  );
}
