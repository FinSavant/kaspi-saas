import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Landing } from '@/components/Landing';
import { LANDING_TEXT } from '@/lib/landing-text';
import { api } from '@/lib/api';
import { SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

const ru = LANDING_TEXT.ru;

export const metadata: Metadata = {
  title: ru.meta.title,
  description: ru.meta.description,
  // Русская и казахская версии ссылаются друг на друга — Google показывает нужную по языку поиска
  alternates: { canonical: 'https://sanq.kz', languages: { ru: 'https://sanq.kz', kk: 'https://sanq.kz/kz', 'x-default': 'https://sanq.kz' } },
  openGraph: { title: ru.meta.ogTitle, description: ru.meta.ogDescription, url: 'https://sanq.kz', siteName: 'SANQ', locale: 'ru_KZ', type: 'website' },
};

interface Shop {
  id: string;
  name: string;
  merchantId: string;
}

const SECTIONS = [
  { path: 'home', title: '🏠 Главная', text: 'Главное за неделю: выручка, прибыль, заказы и робот цен.' },
  { path: 'robot', title: '🤖 Робот цен', text: 'Минимальные цены и выбор товаров для робота.' },
  { path: 'waybills', title: 'Накладные', text: 'Склейка накладных из «Передачи» для термопринтера или A4.' },
  { path: 'analytics', title: 'Аналитика', text: 'Выручка, прибыль, маржа и ROI за неделю, месяц и 3 месяца.' },
];

export default async function HomePage() {
  // Гость (в том числе из поиска) видит страницу о сервисе, продавец — свой кабинет
  if (!(await cookies()).get(SESSION_COOKIE)?.value) return <Landing />;
  const shops = await api<Shop[]>('/shops');
  // С одним магазином список не нужен — сразу в кабинет
  // Новый продавец — сразу к подключению первого магазина
  if (shops.length === 0) redirect('/shops/new');
  if (shops.length === 1) redirect(`/shops/${shops[0]!.id}/home`);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Магазины</h1>
        <Link href="/shops/new" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          + Добавить магазин
        </Link>
      </div>
      {shops.length === 0 && <p className="text-sm text-slate-600">Магазинов пока нет — подключите первый.</p>}
      {shops.map((shop) => (
        <section key={shop.id} className="space-y-3">
          <h2 className="font-semibold">
            {shop.name} <span className="text-sm font-normal text-slate-500">· {shop.merchantId}</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {SECTIONS.map((section) => (
              <Link
                key={section.path}
                href={`/shops/${shop.id}/${section.path}`}
                className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400"
              >
                <div className="font-medium">{section.title}</div>
                <p className="mt-1 text-sm text-slate-600">{section.text}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
