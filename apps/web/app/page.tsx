import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Shop {
  id: string;
  name: string;
  merchantId: string;
}

const SECTIONS = [
  { path: 'products', title: 'Товары и демпинг-бот', text: 'Товары в продаже, минимальные цены, выбор карточек для бота.' },
  { path: 'waybills', title: 'Накладные', text: 'Склейка накладных из «Передачи» для термопринтера или A4.' },
  { path: 'analytics', title: 'Аналитика', text: 'Выручка, прибыль, маржа и ROI за неделю, месяц и 3 месяца.' },
];

export default async function HomePage() {
  const shops = await api<Shop[]>('/shops');
  // С одним магазином список не нужен — сразу в кабинет
  if (shops.length === 1) redirect(`/shops/${shops[0]!.id}/analytics`);

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
