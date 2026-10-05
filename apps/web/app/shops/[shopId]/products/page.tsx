import Link from 'next/link';
import { api } from '@/lib/api';
import { HEADERS } from './columns';
import { ProductRow, SyncButton, type ProductView } from './ProductRow';

export const dynamic = 'force-dynamic';


const botOn = (p: ProductView) => !!p.repricerSetting?.enabled;
const isOpen = (p: ProductView) => (p.sellersCount ?? 0) > 1;

const FILTERS: { key: string; label: string; test: (p: ProductView) => boolean }[] = [
  { key: '', label: 'Все', test: () => true },
  { key: 'bot', label: 'Бот включён', test: botOn },
  { key: 'nobot', label: 'Бот выключен', test: (p) => !botOn(p) },
  { key: 'open', label: 'Открытые карточки', test: isOpen },
  { key: 'opennobot', label: 'Открытые без бота', test: (p) => isOpen(p) && !botOn(p) },
  { key: 'preorder', label: 'На предзаказе', test: (p) => !!p.preOrder },
  { key: 'nopreorder', label: 'Без предзаказа', test: (p) => !p.preorderDays && !p.preOrder },
];

const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });
const SORTS: { key: string; label: string; compare: (a: ProductView, b: ProductView) => number }[] = [
  { key: 'name', label: 'По названию', compare: (a, b) => collator.compare(a.name, b.name) },
  { key: 'bot', label: 'Сначала с ботом', compare: (a, b) => Number(botOn(b)) - Number(botOn(a)) || collator.compare(a.name, b.name) },
  { key: 'sellers', label: 'По числу продавцов', compare: (a, b) => (b.sellersCount ?? 0) - (a.sellersCount ?? 0) },
  { key: 'price', label: 'По цене', compare: (a, b) => b.price - a.price },
  { key: 'stock', label: 'По остатку', compare: (a, b) => b.stock - a.stock },
];

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ open?: string; show?: string; sort?: string }>;
}) {
  const { shopId } = await params;
  const search = await searchParams;
  // ?open=1 — старая ссылка на «Только открытые карточки»
  const show = FILTERS.some((f) => f.key === search.show) ? search.show! : search.open === '1' ? 'open' : '';
  const sort = SORTS.some((s) => s.key === search.sort) ? search.sort! : 'name';

  const all = await api<ProductView[]>(`/shops/${shopId}/products`);
  const filter = FILTERS.find((f) => f.key === show)!.test;
  const products = all.filter(filter).sort(SORTS.find((s) => s.key === sort)!.compare);
  const botCount = all.filter((p) => p.repricerSetting?.enabled).length;
  const base = `/shops/${shopId}/products`;
  const href = (q: { show: string; sort: string }) => `${base}?sort=${q.sort}${q.show ? `&show=${q.show}` : ''}`;
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs whitespace-nowrap ${active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Товары и демпинг-бот</h1>
          <p className="mt-1 text-sm text-slate-600">
            Товаров: {all.length}. Бот включён на {botCount}.
          </p>
        </div>
        <SyncButton shopId={shopId} />
      </div>

      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-slate-500">Показать:</span>
          {FILTERS.map((f) => (
            <Link key={f.key} href={href({ show: f.key, sort })} className={chip(show === f.key)}>
              {f.label} · {all.filter(f.test).length}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-slate-500">Сортировка:</span>
          {SORTS.map((s) => (
            <Link key={s.key} href={href({ show, sort: s.key })} className={chip(sort === s.key)}>
              {s.label}
            </Link>
          ))}
        </div>
      </nav>

      {products.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {all.length === 0 ? 'Товаров пока нет. Нажмите «Синхронизировать товары с Kaspi».' : 'Под этот фильтр товаров нет.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b-2 border-slate-300 text-xs font-bold tracking-wide uppercase">
                {HEADERS.map((h, i) => (
                  <th key={i} className={`px-3 py-2.5 whitespace-nowrap ${h.className}`}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <ProductRow key={product.id} shopId={shopId} product={product} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        «Открытая» — карточка, где кроме вас есть другие продавцы. Бот работает только на товарах с галочкой и
        никогда не опускает цену ниже минимальной.
      </p>
    </div>
  );
}
