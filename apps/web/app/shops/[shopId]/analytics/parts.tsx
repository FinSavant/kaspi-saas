import type { ProductRow, ReportTotals, ShareRow, StatusRow } from '@kaspi/core/analytics';
import type { ReactNode } from 'react';
import { CostForm } from './forms';

export const tenge = (value: number | null | undefined) => (value == null ? '—' : `${value.toLocaleString('ru-RU')} ₸`);
export const pct = (value: number | null | undefined) => (value == null ? '—' : `${value.toLocaleString('ru-RU')}%`);

/** Изменение к прошлому периоду; для расходов рост — это плохо. */
export function Delta({ now, before, inverse = false }: { now: number | null; before: number | null; inverse?: boolean }) {
  if (now === null || before === null || before === 0) return null;
  const change = Math.round(((now - before) / Math.abs(before)) * 1000) / 10;
  if (change === 0) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">0%</span>;
  const good = inverse ? change < 0 : change > 0;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
      {change > 0 ? '↑' : '↓'} {Math.abs(change).toLocaleString('ru-RU')}%
    </span>
  );
}

export function Tile({ label, value, delta, tone = 'default' }: { label: string; value: string; delta?: ReactNode; tone?: 'default' | 'good' | 'info' }) {
  const color = tone === 'good' ? 'text-emerald-700' : tone === 'info' ? 'text-sky-700' : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className={`text-xl font-semibold whitespace-nowrap tabular-nums ${color}`}>{value}</div>
        {delta}
      </div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}

export function Card({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <h2 className="px-4 pt-4 pb-3 font-semibold">{title}</h2>
      <div className="px-4 pb-4">{children}</div>
      {footer && <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">{footer}</div>}
    </section>
  );
}

const TH = 'pb-2 pr-3 font-medium text-right first:text-left';
const TD = 'py-2 pr-3 text-right tabular-nums first:text-left';

export function ShareTable({ rows, nameTitle, withAvgCheck = false }: { rows: ShareRow[]; nameTitle: string; withAvgCheck?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">Нет данных за период.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-slate-500">
          <th className={TH}>{nameTitle}</th>
          <th className={TH}>Заказы</th>
          <th className={TH}>Выручка</th>
          {withAvgCheck && <th className={TH}>Ср. чек</th>}
          <th className={TH}>Доля</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-slate-200">
            <td className={TD} title={r.key}>
              {r.label}
            </td>
            <td className={TD}>{r.orders}</td>
            <td className={TD}>{tenge(r.revenue)}</td>
            {withAvgCheck && <td className={TD}>{tenge(r.avgCheck)}</td>}
            <td className={TD}>{pct(r.sharePercent)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatusBars({ rows }: { rows: StatusRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">Нет заказов за период.</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.status} className="text-sm">
          <div className="flex justify-between">
            <span title={r.status}>{r.label}</span>
            <span className="tabular-nums text-slate-600">
              {r.count} · {pct(r.sharePercent)}
            </span>
          </div>
          <div className="mt-1 h-2 rounded bg-slate-100">
            <div className="h-2 rounded bg-emerald-500" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ExpenseTable({
  totals,
  previous,
  fees,
  revenueLabel = 'Выручка',
  profitLabel = 'Чистая прибыль',
}: {
  totals: ReportTotals;
  previous?: ReportTotals;
  fees: { commissionVatPercent: number; paymentFeePercent: number };
  revenueLabel?: string;
  profitLabel?: string;
}) {
  const share = (value: number) =>
    totals.revenue === 0 ? '—' : `${(Math.round((value / totals.revenue) * 1000) / 10).toLocaleString('ru-RU')}%`;
  const rows = [
    { label: 'Себестоимость товаров', value: totals.costOfGoods, before: previous?.costOfGoods },
    { label: 'Комиссия Kaspi (по категории)', value: totals.commission, before: previous?.commission },
    { label: `НДС на комиссию (${pct(fees.commissionVatPercent)})`, value: totals.commissionVat, before: previous?.commissionVat },
    { label: `Kaspi Pay (${pct(fees.paymentFeePercent)})`, value: totals.paymentFee, before: previous?.paymentFee },
    { label: 'Доставка (для продавца)', value: totals.delivery, before: previous?.delivery },
  ];
  const profitColor = totals.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700';
  return (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
        <tr>
          <th className="px-3 py-2 font-medium">Статья</th>
          <th className="px-3 py-2 text-right font-medium">Сумма</th>
          <th className="px-3 py-2 text-right font-medium">% от выручки</th>
          {previous && <th className="px-3 py-2 text-right font-medium">К прошлому периоду</th>}
        </tr>
      </thead>
      <tbody>
        <tr className="border-t border-slate-200 font-semibold">
          <td className="px-3 py-2">{revenueLabel}</td>
          <td className="px-3 py-2 text-right tabular-nums">{tenge(totals.revenue)}</td>
          <td className="px-3 py-2 text-right tabular-nums">100%</td>
          {previous && (
            <td className="px-3 py-2 text-right">
              <Delta now={totals.revenue} before={previous.revenue} />
            </td>
          )}
        </tr>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-slate-200 text-red-700">
            <td className="px-3 py-2">− {r.label}</td>
            <td className="px-3 py-2 text-right tabular-nums">{tenge(r.value)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{share(r.value)}</td>
            {previous && (
              <td className="px-3 py-2 text-right">
                <Delta now={r.value} before={r.before ?? null} inverse />
              </td>
            )}
          </tr>
        ))}
        <tr className="border-t border-slate-200 bg-slate-100 font-semibold">
          <td className="px-3 py-2">= {profitLabel}</td>
          <td className={`px-3 py-2 text-right tabular-nums ${profitColor}`}>{tenge(totals.netProfit)}</td>
          <td className={`px-3 py-2 text-right tabular-nums ${profitColor}`}>{share(totals.netProfit)}</td>
          {previous && (
            <td className="px-3 py-2 text-right">
              <Delta now={totals.netProfit} before={previous.netProfit} />
            </td>
          )}
        </tr>
      </tbody>
    </table>
  );
}

export function ProductTable({
  rows,
  shopId,
  unitCosts,
}: {
  rows: ProductRow[];
  shopId: string;
  unitCosts: Record<string, number | null>;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">Нет товаров для показа.</p>;
  const maxShare = Math.max(...rows.map((r) => r.sharePercent ?? 0), 1);

  // Колонки сгруппированы и окрашены: продажи — синие, расходы — красные, результат — зелёный
  const sales = 'bg-sky-50/60';
  const costs = 'bg-rose-50/50';
  const result = 'bg-emerald-50/60';
  const th = 'px-3 py-2 text-right font-medium whitespace-nowrap';
  const td = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1150px] text-sm">
        <thead className="text-xs">
          <tr className="font-semibold tracking-wide uppercase">
            <th colSpan={3} />
            <th colSpan={3} className={`${sales} rounded-t-lg px-3 pt-2 text-center text-sky-800`}>Продажи</th>
            <th colSpan={4} className={`${costs} rounded-t-lg px-3 pt-2 text-center text-rose-800`}>Расходы на единицы</th>
            <th colSpan={3} className={`${result} rounded-t-lg px-3 pt-2 text-center text-emerald-800`}>Результат</th>
          </tr>
          <tr className="border-b border-slate-300 text-slate-500">
            <th className="px-2 py-2 text-left font-medium">#</th>
            <th className="px-2 py-2 text-left font-medium">Товар</th>
            <th className="px-2 py-2 text-center font-medium">ABC</th>
            <th className={`${th} ${sales} text-sky-800`}>Продано, шт</th>
            <th className={`${th} ${sales} text-sky-800`}>Выручка</th>
            <th className={`${th} ${sales} text-sky-800`}>Ср. цена</th>
            <th className={`${th} ${costs} text-rose-800`}>Комиссия с НДС</th>
            <th className={`${th} ${costs} text-rose-800`}>Kaspi Pay</th>
            <th className={`${th} ${costs} text-rose-800`}>Доставка</th>
            <th className={`${th} ${costs} text-rose-800`}>Себестоимость ед.</th>
            <th className={`${th} ${result} text-emerald-800`}>Прибыль</th>
            <th className={`${th} ${result} text-emerald-800`}>Маржа</th>
            <th className={`${th} ${result} text-emerald-800`}>Доля выручки</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, index) => (
            <tr key={p.sku} className="border-t border-slate-200 align-middle hover:bg-slate-50">
              <td className="px-2 py-2 text-slate-400 tabular-nums">{index + 1}</td>
              <td className="max-w-xs px-2 py-2">
                <div className="font-medium text-slate-900">{p.name}</div>
                <div className="text-xs text-slate-400">{p.sku}</div>
              </td>
              <td className="px-2 py-2 text-center">
                <AbcBadge abc={p.abc} />
              </td>
              <td className={`${td} ${sales} text-sky-900`}>{p.units}</td>
              <td className={`${td} ${sales} font-semibold text-sky-900`}>{tenge(p.revenue)}</td>
              <td className={`${td} ${sales} text-sky-700`}>{tenge(p.avgPrice)}</td>
              <td className={`${td} ${costs} text-rose-700`}>{minus(p.commission)}</td>
              <td className={`${td} ${costs} text-rose-700`}>{minus(p.paymentFee)}</td>
              <td className={`${td} ${costs} text-rose-700`}>{minus(p.delivery)}</td>
              <td className={`${costs} px-3 py-2 text-right`}>
                <CostForm shopId={shopId} productId={p.productId} sku={p.sku} costPrice={p.productId ? (unitCosts[p.productId] ?? null) : null} />
                {!p.productId && (
                  <div className="mt-0.5 text-[10px] text-slate-400" title="Товар снят с продажи — себестоимость сохранится по артикулу">
                    нет в каталоге
                  </div>
                )}
              </td>
              <td className={`${td} ${result}`}>
                {p.netProfit == null ? (
                  <span className="text-xs text-slate-400" title="Укажите себестоимость, чтобы посчитать прибыль">
                    нет себест.
                  </span>
                ) : (
                  <span className={`font-bold ${p.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{tenge(p.netProfit)}</span>
                )}
              </td>
              <td className={`${td} ${result}`}>
                <MarginBadge value={p.marginPercent} />
              </td>
              <td className={`${td} ${result}`}>
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-14 rounded-full bg-slate-200">
                    <div className="h-1.5 rounded-full bg-violet-500" style={{ width: `${((p.sharePercent ?? 0) / maxShare) * 100}%` }} />
                  </div>
                  <span className="w-12 text-violet-700">{pct(p.sharePercent)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const PRODUCT_SORTS = [
  { key: 'revenue', label: 'По выручке' },
  { key: 'profit', label: 'По прибыли' },
  { key: 'loss', label: 'Сначала убыточные' },
  { key: 'margin', label: 'По марже' },
  { key: 'units', label: 'По продажам, шт' },
] as const;

export const PRODUCT_FILTERS = [
  { key: '', label: 'Все' },
  { key: 'loss', label: 'Только в минусе' },
  { key: 'profit', label: 'Только в плюсе' },
  { key: 'nocost', label: 'Без себестоимости' },
] as const;

/** Сортировка и фильтр товаров аналитики; товары без прибыли (нет себестоимости) — в конце. */
export function arrangeProducts(rows: ProductRow[], sort = 'revenue', only = ''): ProductRow[] {
  const filtered = rows.filter((r) =>
    only === 'loss' ? (r.netProfit ?? 0) < 0 : only === 'profit' ? (r.netProfit ?? 0) > 0 : only === 'nocost' ? r.netProfit == null : true,
  );
  const last = (v: number | null | undefined, desc: boolean) => (v == null ? (desc ? -Infinity : Infinity) : v);
  const by: Record<string, (a: ProductRow, b: ProductRow) => number> = {
    revenue: (a, b) => b.revenue - a.revenue,
    profit: (a, b) => last(b.netProfit, true) - last(a.netProfit, true),
    loss: (a, b) => last(a.netProfit, false) - last(b.netProfit, false),
    margin: (a, b) => last(b.marginPercent, true) - last(a.marginPercent, true),
    units: (a, b) => b.units - a.units,
  };
  return [...filtered].sort(by[sort] ?? by.revenue);
}

/** Панель «Сортировка / Показать» ссылками: состояние живёт в адресе страницы. */
export function ProductToolbar({ href, sort, only }: { href: (q: { sort: string; only: string }) => string; sort: string; only: string }) {
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs whitespace-nowrap ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-slate-500">Сортировка:</span>
        {PRODUCT_SORTS.map((s) => (
          <a key={s.key} href={href({ sort: s.key, only })} className={chip(sort === s.key)}>
            {s.label}
          </a>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-slate-500">Показать:</span>
        {PRODUCT_FILTERS.map((f) => (
          <a key={f.key} href={href({ sort, only: f.key })} className={chip(only === f.key)}>
            {f.label}
          </a>
        ))}
      </div>
    </div>
  );
}

const minus = (value: number | null | undefined) => (value ? `−${tenge(value)}` : tenge(value));

function AbcBadge({ abc }: { abc: string }) {
  const color = abc === 'A' ? 'bg-emerald-100 text-emerald-800' : abc === 'B' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-block w-6 rounded text-center text-xs font-bold ${color}`}>{abc}</span>;
}

/** Маржа: плюс — зелёный, минус — красный, нет себестоимости — серый прочерк. */
function MarginBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-400">—</span>;
  const color = value > 0 ? 'bg-emerald-100 text-emerald-800' : value < 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{pct(value)}</span>;
}
