'use client';

import { useActionState, useState, useTransition } from 'react';
import { loadCandidates, printWaybills, reprintBatch, type Candidate, type PrintState } from './actions';

const LAYOUTS = [
  { value: 'thermal', label: 'Термопринтер, 100×150 мм' },
  { value: 'a4x4', label: 'A4, 4 на листе' },
  { value: 'a4x8', label: 'A4, 8 на листе' },
];

const SELECT = 'rounded border border-slate-300 bg-white px-3 py-2 text-sm';

function LayoutSelect({ exclude }: { exclude?: string }) {
  const options = LAYOUTS.filter((l) => l.value !== exclude);
  return (
    <select name="layout" defaultValue={options[0]!.value} className={SELECT}>
      {options.map((layout) => (
        <option key={layout.value} value={layout.value}>
          {layout.label}
        </option>
      ))}
    </select>
  );
}

function ResultMessage({ shopId, state }: { shopId: string; state: PrintState }) {
  const result = state.result;
  return (
    <>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {result && result.count === 0 && result.notReady === 0 && (
        <p className="text-sm text-slate-600">Подходящих заказов в «Передаче» нет.</p>
      )}
      {result && result.count > 0 && (result.href || result.batchId) && (
        <p className="text-sm text-emerald-700">
          Готово: накладных в файле — {result.count}.{' '}
          <a href={result.href ?? `/shops/${shopId}/waybills/${result.batchId}/pdf`} className="font-medium underline">
            Скачать PDF
          </a>
        </p>
      )}
      {state.perShop && (
        <ul className="space-y-0.5 text-xs text-slate-600">
          {state.perShop.map((s) => (
            <li key={s.name}>
              {s.name}: {s.error ? <span className="text-red-600">{s.error}</span> : `накладных ${s.count}${s.notReady ? `, не готовы в Kaspi ${s.notReady}` : ''}`}
            </li>
          ))}
        </ul>
      )}
      {result && result.notReady > 0 && (
        <p className="text-sm text-amber-700">
          Kaspi не отдал накладные: {result.notReady}. Они не отмечены напечатанными — повторите через 10–15 минут.
        </p>
      )}
      {result && result.unreadable > 0 && (
        <p className="text-sm text-amber-700">Не удалось прочитать файлов: {result.unreadable}. Они попадут в следующую склейку.</p>
      )}
    </>
  );
}

const SORTS = [
  { value: 'none', label: 'Без сортировки' },
  { value: 'product', label: 'По названию товара' },
  { value: 'product_city', label: 'По названию и городу' },
];

function CheckList({ name, options }: { name: string; options: { value: string; label: string; hint?: string }[] }) {
  return (
    <div className="max-h-56 space-y-1 overflow-y-auto rounded border border-slate-200 p-2">
      {options.map((o) => (
        <label key={o.value} className="flex items-start gap-2 text-sm">
          <input type="checkbox" name={name} value={o.value} className="mt-0.5" />
          <span>
            {o.label}
            {o.hint && <span className="ml-1 text-xs text-slate-500">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Фильтры по городам, товарам и заказам из «Передачи». Пусто — значит «все». */
function PrintFilters({ shopId }: { shopId: string }) {
  const [orders, setOrders] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string>();
  const [loading, startLoading] = useTransition();

  const load = () =>
    startLoading(async () => {
      const result = await loadCandidates(shopId);
      setError(result.error);
      setOrders(result.orders ?? null);
    });

  if (!orders) {
    return (
      <div className="space-y-1">
        <button type="button" onClick={load} disabled={loading} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50">
          {loading ? 'Загружаю заказы…' : 'Загрузить заказы из «Передачи»'}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
  if (orders.length === 0) return <p className="text-sm text-slate-500">В «Передаче» сейчас нет заказов.</p>;

  const count = (values: string[]) => {
    const map = new Map<string, number>();
    for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
    return [...map].sort((a, b) => b[1] - a[1]);
  };
  const cities = count(orders.map((o) => o.city ?? ''));
  const products = new Map<string, { name: string; orders: number }>();
  for (const o of orders) {
    for (const i of o.items) {
      const p = products.get(i.sku) ?? { name: i.name, orders: 0 };
      p.orders++;
      products.set(i.sku, p);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div>
        <div className="mb-1 text-xs font-medium text-slate-500 uppercase">Города</div>
        <CheckList name="cities" options={cities.map(([city, n]) => ({ value: city, label: city || 'Не указан', hint: `· ${n}` }))} />
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-slate-500 uppercase">Товары</div>
        <CheckList
          name="skus"
          options={[...products].map(([sku, p]) => ({ value: sku, label: p.name, hint: `· ${p.orders}` }))}
        />
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-slate-500 uppercase">Заказы</div>
        <CheckList
          name="orderCodes"
          options={orders.map((o) => ({
            value: o.code,
            label: o.code,
            hint: `· ${o.city ?? ''}${o.express ? ' · экспресс' : ''}${o.printed ? ' · уже печатался' : ''}`,
          }))}
        />
      </div>
      <p className="text-xs text-slate-500 md:col-span-3">
        Ничего не отмечено — печатаются все заказы. Отмеченные фильтры сужают список. Фильтры по товарам и заказам
        относятся только к текущему магазину.
      </p>
    </div>
  );
}

export function PrintForm({ shopId, shops }: { shopId: string; shops: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<PrintState, FormData>(printWaybills, {});

  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <input type="hidden" name="shopId" value={shopId} />
      {shops.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium">Магазины:</span>
          {shops.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5">
              <input type="checkbox" name="shopIds" value={s.id} defaultChecked={s.id === shopId} /> {s.name}
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <LayoutSelect />
        <select name="sort" defaultValue="product" className={SELECT} aria-label="Сортировка">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? 'Склеиваю…' : 'Получить накладные'}
        </button>
      </div>

      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium">Расширенные настройки</summary>
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="onlyNew" defaultChecked /> Только новые заказы (без уже напечатанных)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="excludeExpress" /> Без экспресс-заказов
          </label>
          <div className="flex flex-wrap items-center gap-2">
            Только заказы, созданные
            <span>с</span>
            <input type="date" name="createdFrom" className="rounded border border-slate-300 px-2 py-1" aria-label="С" />
            <span>по</span>
            <input type="date" name="createdTo" className="rounded border border-slate-300 px-2 py-1" aria-label="По" />
          </div>
        </div>
      </details>

      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium">Фильтры печати: города, товары, заказы</summary>
        <div className="mt-3">
          <PrintFilters shopId={shopId} />
        </div>
      </details>

      <ResultMessage shopId={shopId} state={state} />
    </form>
  );
}

/** Пересборка прежней склейки в другом формате; отметки «напечатано» не меняются. */
export function ReprintForm({ shopId, batchId, currentLayout }: { shopId: string; batchId: string; currentLayout: string }) {
  const [state, action, pending] = useActionState<PrintState, FormData>(reprintBatch, {});

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="shopId" value={shopId} />
      <input type="hidden" name="batchId" value={batchId} />
      <div className="flex items-center justify-end gap-2">
        <LayoutSelect exclude={currentLayout} />
        <button type="submit" disabled={pending} className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-50">
          {pending ? '…' : 'Пересобрать'}
        </button>
      </div>
      <ResultMessage shopId={shopId} state={state} />
    </form>
  );
}
