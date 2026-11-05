'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { handoverOrders, loadPacking, type PackingOrder } from './actions';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'short', timeStyle: 'short' });

/**
 * Заказы «На упаковке»: выбрать галочками, указать число мест и перевести в «Передачу».
 * Накладные после перевода получают отдельной кнопкой ниже («Склеить накладные»).
 */
export function HandoverPanel({ shopId }: { shopId: string }) {
  const [orders, setOrders] = useState<PackingOrder[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [places, setPlaces] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ code: string; ok: boolean; error?: string }[] | null>(null);
  const [pending, startTransition] = useTransition();
  // Защита от двойного нажатия: флаг ставится сразу, до перерисовки
  const busy = useRef(false);

  const allSelected = orders !== null && orders.length > 0 && selected.size === orders.length;
  const placesOf = (code: string) => places[code] ?? 1;
  const resultOf = useMemo(() => new Map((results ?? []).map((r) => [r.code, r])), [results]);

  const load = () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setResults(null);
    startTransition(async () => {
      const res = await loadPacking(shopId);
      if (res.error) setError(res.error);
      else {
        setOrders(res.orders ?? []);
        setSelected(new Set());
      }
      busy.current = false;
    });
  };

  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const submit = () => {
    if (busy.current || selected.size === 0) return;
    if (!window.confirm(`Передать заказов: ${selected.size}? Они уйдут из «Упаковки» в «Передачу» в Kaspi.`)) return;
    busy.current = true;
    setError(null);
    startTransition(async () => {
      const res = await handoverOrders(
        shopId,
        [...selected].map((code) => ({ code, places: placesOf(code) })),
      );
      if (res.error) setError(res.error);
      else {
        const done = res.results ?? [];
        setResults(done);
        // Успешно переданные убираем из списка, ошибочные остаются выбранными
        const okCodes = new Set(done.filter((r) => r.ok).map((r) => r.code));
        setOrders((prev) => prev?.filter((o) => !okCodes.has(o.code)) ?? null);
        setSelected(new Set(done.filter((r) => !r.ok).map((r) => r.code)));
      }
      busy.current = false;
    });
  };

  const okCount = results?.filter((r) => r.ok).length ?? 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Передача заказов из «Упаковки»</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Отметьте заказы, укажите число мест и нажмите «Передать выбранные»: заказы перейдут в «Передачу», после этого
            склейте накладные кнопкой ниже.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={pending}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {pending && orders === null ? 'Загружаю…' : orders === null ? 'Показать заказы на упаковке' : 'Обновить список'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {results && (
        <p className={`mt-3 text-sm ${okCount === results.length ? 'text-emerald-700' : 'text-amber-700'}`}>
          Передано в «Передачу»: {okCount} из {results.length}.
          {okCount > 0 && ' Теперь можно склеивать накладные.'}
        </p>
      )}

      {orders !== null && orders.length === 0 && <p className="mt-3 text-sm text-slate-500">Заказов на упаковке нет.</p>}

      {orders !== null && orders.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(orders.map((o) => o.code)))}
              />
              Выбрать все ({orders.length})
            </label>
            <button
              type="button"
              onClick={submit}
              disabled={pending || selected.size === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending ? 'Передаю…' : `Передать выбранные (${selected.size})`}
            </button>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="w-8 pb-2" />
                  <th className="pb-2 font-medium">Заказ</th>
                  <th className="pb-2 font-medium">Товары</th>
                  <th className="pb-2 font-medium">Город</th>
                  <th className="pb-2 font-medium">Создан</th>
                  <th className="pb-2 text-right font-medium">Мест</th>
                  <th className="pb-2 pl-3 font-medium">Результат</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const r = resultOf.get(o.code);
                  return (
                    <tr key={o.code} className="border-t border-slate-100 align-top">
                      <td className="py-2">
                        <input type="checkbox" checked={selected.has(o.code)} onChange={() => toggle(o.code)} aria-label={`Выбрать заказ ${o.code}`} />
                      </td>
                      <td className="py-2 tabular-nums">
                        {o.code}
                        {o.express && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">экспресс</span>}
                      </td>
                      <td className="py-2 text-xs text-slate-700">
                        {o.items.length === 0 ? '—' : o.items.map((i) => `${i.name} × ${i.quantity}`).join('; ')}
                      </td>
                      <td className="py-2">{o.city ?? '—'}</td>
                      <td className="py-2 tabular-nums text-xs text-slate-600">{formatDate(o.createdAt)}</td>
                      <td className="py-2 text-right">
                        <input
                          type="number"
                          min={1}
                          max={99}
                          step={1}
                          value={placesOf(o.code)}
                          onChange={(e) => setPlaces((p) => ({ ...p, [o.code]: Math.min(99, Math.max(1, Math.floor(Number(e.target.value)) || 1)) }))}
                          className="w-16 rounded border border-slate-300 px-2 py-1 text-right"
                          aria-label={`Число мест, заказ ${o.code}`}
                        />
                      </td>
                      <td className="py-2 pl-3 text-xs">
                        {r && (r.ok ? <span className="text-emerald-700">✓ передан</span> : <span className="text-red-600">{r.error}</span>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
