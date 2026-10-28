import Link from 'next/link';
import { SearchBox } from '@/components/SearchBox';
import { api } from '@/lib/api';
import { CostInput } from '../forms';

export const dynamic = 'force-dynamic';

interface WbProductItem {
  nmId: string;
  saName: string | null;
  title: string | null;
  costPrice: number | null;
  units: number;
  revenue: number;
  avgPrice: number | null;
  deliveryPerUnit: number | null;
  commissionPerUnit: number | null;
  lastSale: string | null;
}

const tenge = (v: number | null) => (v === null ? '—' : `${Math.round(v).toLocaleString('ru-RU')} ₸`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'Asia/Almaty' }) : '—');

export default async function WbProductsPage({ params, searchParams }: { params: Promise<{ shopId: string }>; searchParams: Promise<{ only?: string; q?: string }> }) {
  const { shopId } = await params;
  const { only = '', q = '' } = await searchParams;
  const all = await api<WbProductItem[]>(`/shops/${shopId}/wb/products`);
  const query = q.trim().toLocaleLowerCase('ru');
  const products = all
    .filter((p) => (only === 'nocost' ? p.costPrice === null : true))
    .filter((p) => !query || [p.title, p.saName, p.nmId].some((v) => v?.toLocaleLowerCase('ru').includes(query)));
  const withCost = all.filter((p) => p.costPrice !== null).length;
  const base = `/shops/${shopId}/wb/products`;
  const filters = [
    { key: '', label: `Все · ${all.length}` },
    { key: 'nocost', label: `Без себестоимости · ${all.length - withCost}` },
  ];

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-fuchsia-600 to-pink-500 p-6 text-white shadow-lg">
        <div className="text-sm font-medium text-white/80">Wildberries</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Товары</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/85">
          Все товары из ваших отчётов. Себестоимость за штуку вносится один раз и применяется ко всем отчётам — меняйте её, когда
          меняется закупка.
        </p>
        <div className="mt-4 h-2 max-w-md overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white" style={{ width: `${all.length ? (withCost / all.length) * 100 : 0}%` }} />
        </div>
        <div className="mt-1 text-sm text-white/85">
          Себестоимость указана: {withCost} из {all.length}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBox />
        <div className="flex-1" />
        <nav className="flex rounded-xl bg-white p-1 text-sm ring-1 ring-slate-200">
          {filters.map((f) => (
            <Link
              key={f.key}
              href={`${base}${f.key ? `?only=${f.key}` : ''}`}
              className={`rounded-lg px-3 py-1.5 whitespace-nowrap ${only === f.key ? 'bg-violet-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-violet-50/60 text-right text-xs text-violet-900/70 uppercase">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Товар</th>
              <th className="px-3 py-3 font-semibold" title="Вся логистика товара, включая возвраты и отмены, делённая на проданные штуки">
                Логистика за 1 шт
              </th>
              <th className="px-3 py-3 font-semibold" title="Вознаграждение WB, делённое на проданные штуки">
                Комиссия за 1 шт
              </th>
              <th className="px-3 py-3 font-semibold">Продано всего</th>
              <th className="px-3 py-3 font-semibold">Средняя цена</th>
              <th className="px-3 py-3 font-semibold">Реализовано</th>
              <th className="px-3 py-3 font-semibold">Последняя продажа</th>
              <th className="px-4 py-3 font-semibold">Себестоимость, шт</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.nmId} className={`border-t border-slate-100 text-right tabular-nums ${p.costPrice === null ? 'bg-amber-50/40' : 'hover:bg-violet-50/40'}`}>
                <td className="max-w-md px-4 py-2.5 text-left">
                  <a href={`https://www.wildberries.ru/catalog/${p.nmId}/detail.aspx`} target="_blank" rel="noreferrer" className="font-medium hover:text-violet-700 hover:underline">
                    {p.title ?? `Артикул WB ${p.nmId}`}
                  </a>
                  <div className="text-xs text-slate-400">
                    {p.saName ?? '—'} · WB {p.nmId}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-rose-700">{tenge(p.deliveryPerUnit)}</td>
                <td className="px-3 py-2.5 text-rose-700">{tenge(p.commissionPerUnit)}</td>
                <td className="px-3 py-2.5">{p.units} шт</td>
                <td className="px-3 py-2.5 text-slate-600">{tenge(p.avgPrice)}</td>
                <td className="px-3 py-2.5 font-medium">{tenge(p.revenue)}</td>
                <td className="px-3 py-2.5 text-slate-500">{day(p.lastSale)}</td>
                <td className="px-4 py-2.5">
                  <CostInput shopId={shopId} nmId={p.nmId} value={p.costPrice} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">{all.length ? 'Ничего не найдено.' : 'Товары появятся после загрузки первого отчёта.'}</p>
        )}
      </div>
    </div>
  );
}
