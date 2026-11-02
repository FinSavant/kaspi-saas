import { DropdownMenu } from '@/components/DropdownMenu';
import { HelpTip } from '@/components/HelpTip';
import { TIPS } from '@/lib/tips';
import { SearchBox } from '@/components/SearchBox';
import { ShopTabs } from '@/components/ShopTabs';
import { MarkupForm } from './MarkupForm';
import { api } from '@/lib/api';
import { BulkBar, BulkProvider, SelectAllCheckbox } from './Bulk';
import { HEADERS, hiddenIn, type ProductsView } from './columns';
import { ProductRow, SyncButton, type ProductView } from './ProductRow';



const botOn = (p: ProductView) => !!p.repricerSetting?.enabled;
const isOpen = (p: ProductView) => (p.sellersCount ?? 0) > 1;
const atFloor = (p: ProductView) => !!p.repricerSetting && p.price <= p.repricerSetting.floorPrice;

// Фильтры как в Okto. «Архив» — снятые с продажи, загружаются отдельным запросом
const FILTERS: { key: string; label: string; test: (p: ProductView) => boolean }[] = [
  { key: '', label: 'Товары на продаже', test: () => true },
  { key: 'bot', label: 'С ботом', test: botOn },
  { key: 'nobot', label: 'Без бота', test: (p) => !botOn(p) },
  { key: 'floor', label: 'Достиг мин. цены', test: (p) => botOn(p) && atFloor(p) },
  { key: 'preorder', label: 'На предзаказе', test: (p) => !!p.preOrder },
  { key: 'nopreorder', label: 'Без предзаказа', test: (p) => !p.preorderDays && !p.preOrder },
  { key: 'pos1', label: 'На 1-ом месте', test: (p) => p.position === 1 },
  { key: 'pos2', label: 'На 2-ом месте', test: (p) => p.position === 2 },
  { key: 'pos3', label: 'На 3-ем месте', test: (p) => p.position === 3 },
  { key: 'notop', label: 'Не в топе', test: (p) => p.position !== null && p.position > 3 },
  { key: 'open', label: 'Открытые карточки', test: isOpen },
  { key: 'archive', label: 'Архив', test: () => true },
];

const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });
const SORTS: { key: string; label: string; compare: (a: ProductView, b: ProductView) => number }[] = [
  { key: 'name', label: 'По названию', compare: (a, b) => collator.compare(a.name, b.name) },
  { key: 'bot', label: 'Сначала с ботом', compare: (a, b) => Number(botOn(b)) - Number(botOn(a)) || collator.compare(a.name, b.name) },
  { key: 'position', label: 'По месту в карточке', compare: (a, b) => (a.position ?? 99) - (b.position ?? 99) || collator.compare(a.name, b.name) },
  { key: 'sellers', label: 'По числу продавцов', compare: (a, b) => (b.sellersCount ?? 0) - (a.sellersCount ?? 0) },
  { key: 'price', label: 'По цене', compare: (a, b) => b.price - a.price },
  { key: 'stock', label: 'По остатку', compare: (a, b) => b.stock - a.stock },
];

const TILE_TONES = {
  slate: 'border-slate-200 bg-white text-slate-900',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  sky: 'border-sky-200 bg-sky-50 text-sky-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
};

function StatTile({ label, value, tone }: { label: string; value: number; tone: keyof typeof TILE_TONES }) {
  return (
    <div className={`min-w-32 rounded-xl border px-4 py-2.5 shadow-sm ${TILE_TONES[tone]}`}>
      <div className="text-2xl leading-tight font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium opacity-80">{label}</div>
    </div>
  );
}

export interface ProductsPageProps {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ open?: string; show?: string; sort?: string; q?: string }>;
}

/** Таблица товаров магазина; «Товары» и «Робот цен» показывают разные колонки одной таблицы. */
export async function ProductsScreen({ view, params, searchParams }: ProductsPageProps & { view: ProductsView }) {
  const { shopId } = await params;
  const search = await searchParams;
  // ?open=1 — старая ссылка на «Только открытые карточки»
  const show = FILTERS.some((f) => f.key === search.show) ? search.show! : search.open === '1' ? 'open' : '';
  const sort = SORTS.some((s) => s.key === search.sort) ? search.sort! : 'name';

  const [all, archived, shops, settings] = await Promise.all([
    api<ProductView[]>(`/shops/${shopId}/products`),
    api<ProductView[]>(`/shops/${shopId}/products?archived=1`),
    api<{ id: string; name: string }[]>('/shops'),
    api<{ markupPercents: number[] }>(`/shops/${shopId}/settings`),
  ]);
  const filter = FILTERS.find((f) => f.key === show)!.test;
  // Поиск по названию и артикулу, без учёта регистра
  const query = (search.q ?? '').trim().toLocaleLowerCase('ru');
  const matches = (p: ProductView) => !query || p.name.toLocaleLowerCase('ru').includes(query) || p.kaspiSku.toLowerCase().includes(query);
  const products = (show === 'archive' ? archived : all)
    .filter((p) => filter(p) && matches(p))
    .sort(SORTS.find((s) => s.key === sort)!.compare);
  const botCount = all.filter((p) => p.repricerSetting?.enabled).length;
  const base = `/shops/${shopId}/${view === 'robot' ? 'robot' : 'products'}`;
  const href = (q: { show: string; sort: string }) =>
    `${base}?sort=${q.sort}${q.show ? `&show=${q.show}` : ''}${search.q ? `&q=${encodeURIComponent(search.q)}` : ''}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{view === 'robot' ? '🤖 Робот цен' : '🏷️ Товары/Предзаказ'}</h1>
            <HelpTip {...TIPS[view]} />
            {/* Переключение магазина прямо здесь: фильтр и сортировка сохраняются */}
            <ShopTabs shops={shops} shopId={shopId} section={view === 'robot' ? 'robot' : 'products'} query={`sort=${sort}${show ? `&show=${show}` : ''}`} />
          </div>
          {/* Плитки сверху, как в Okto: главные цифры видны сразу */}
          <div className="mt-3 flex flex-wrap gap-2">
            <StatTile label="Товаров в продаже" value={all.length} tone="slate" />
            <StatTile label="Робот включён" value={botCount} tone="emerald" />
            <StatTile label="На 1-ом месте" value={all.filter((p) => p.position === 1).length} tone="sky" />
            <StatTile label="Достиг мин. цены" value={all.filter((p) => botOn(p) && atFloor(p)).length} tone="amber" />
            <StatTile label="На предзаказе" value={all.filter((p) => !!p.preOrder).length} tone="indigo" />
          </div>
        </div>
        <SyncButton shopId={shopId} />
      </div>

      <nav className="flex flex-wrap items-center gap-2">
        <SearchBox />
        <div className="flex-1" />
        <DropdownMenu
          icon="⏷"
          items={FILTERS.map((f) => ({
            href: href({ show: f.key, sort }),
            label: f.label,
            count: f.key === 'archive' ? archived.length : all.filter(f.test).length,
            active: show === f.key,
          }))}
        />
        <DropdownMenu
          icon="⇅"
          items={SORTS.map((s) => ({ href: href({ show, sort: s.key }), label: s.label, active: sort === s.key }))}
        />
      </nav>

      {products.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          {all.length === 0 ? 'Товаров пока нет. Нажмите «Синхронизировать товары с Kaspi».' : query ? `По запросу «${search.q}» ничего не найдено.` : 'Под этот фильтр товаров нет.'}
        </p>
      ) : (
        <BulkProvider ids={products.map((p) => p.id)}>
          <BulkBar shopId={shopId} />
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 text-xs font-bold tracking-wide uppercase">
                  <th className="py-2.5 pl-3 text-left">
                    <SelectAllCheckbox />
                  </th>
                  {HEADERS.map((h) => (
                    <th key={h.key} className={`${hiddenIn(view, h.key)} px-2 py-2.5 whitespace-nowrap ${h.className}`}>
                      {h.key === 'markup' && view === 'robot' ? (
                        <MarkupForm shopId={shopId} percent={[...settings.markupPercents].sort((a, b) => a - b)[0] ?? 5} />
                      ) : (
                        h.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <ProductRow key={product.id} shopId={shopId} product={product} view={view} />
                ))}
              </tbody>
            </table>
          </div>
        </BulkProvider>
      )}

      <p className="text-xs text-slate-500">
        «Открытая» — карточка, где кроме вас есть другие продавцы. Бот работает только на товарах с галочкой и
        никогда не опускает цену ниже минимальной.
      </p>
    </div>
  );
}
