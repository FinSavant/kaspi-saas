'use client';

import { useState, useTransition } from 'react';
import { saveMarks, type PickingMarkPatch } from './actions';

export interface PickingOrder {
  code: string;
  quantity: number;
  express: boolean;
  city: string | null;
  collected: boolean;
  packed: boolean;
}

export interface PickingGroup {
  sku: string;
  name: string;
  imageUrl: string | null;
  brand: string | null;
  categoryTitle: string | null;
  quantity: number;
  orders: PickingOrder[];
}

type Flag = 'collected' | 'packed';
const LABEL: Record<Flag, string> = { collected: 'Собрано', packed: 'Упаковано' };

/** Номер заказа как на WB: последние 4 цифры крупнее — по ним ищут на полке. */
function OrderCode({ code, index }: { code: string; index?: number }) {
  return (
    <span className="text-2xl tracking-wide text-slate-700 tabular-nums">
      {index !== undefined && <span className="mr-1">{index}.</span>}
      {code.slice(0, -4)} <span className="font-bold text-slate-900">{code.slice(-4)}</span>
    </span>
  );
}

function Check({ label, checked, sub, onChange }: { label: string; checked: boolean; sub?: string; onChange: (value: boolean) => void }) {
  return (
    <label
      className={`inline-flex cursor-pointer flex-col rounded-lg border px-3 py-2 text-sm select-none ${
        checked ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
    >
      <span className="flex items-center gap-2 whitespace-nowrap">
        {label}
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
      </span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </label>
  );
}

function PrintLink({ shopId, code }: { shopId: string; code: string }) {
  return (
    <a
      href={`/shops/${shopId}/picking/waybill/${code}`}
      target="_blank"
      rel="noreferrer"
      title="Накладная заказа"
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-lg hover:bg-slate-200"
    >
      🖨
    </a>
  );
}

export function Picking({ shopId, groups: initial }: { shopId: string; groups: PickingGroup[] }) {
  const [groups, setGroups] = useState(initial);
  const [expandAll, setExpandAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const lines = groups.flatMap((g) => g.orders);
  const orderCount = new Set(lines.map((o) => o.code)).size;
  const done = (flag: Flag) => lines.filter((o) => o[flag]).length;

  /** Меняет галочки на экране сразу и сохраняет; при ошибке возвращает как было. */
  function mark(sku: string, codes: string[], flag: Flag, value: boolean) {
    const before = groups;
    setGroups((gs) =>
      gs.map((g) => (g.sku !== sku ? g : { ...g, orders: g.orders.map((o) => (codes.includes(o.code) ? { ...o, [flag]: value } : o)) })),
    );
    const patch: PickingMarkPatch[] = codes.map((orderCode) => ({ orderCode, sku, [flag]: value }));
    startTransition(async () => {
      const result = await saveMarks(shopId, patch);
      if (result.error) {
        setGroups(before);
        setError(result.error);
      } else setError(null);
    });
  }

  const toggle = (sku: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
        <span>Всего {orderCount} заказов</span>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={expandAll} onChange={(e) => setExpandAll(e.target.checked)} className="h-4 w-4" />
          Развернуть заказы
        </label>
        <div className="flex-1" />
        {(['collected', 'packed'] as const).map((flag) => (
          <span key={flag} className="flex items-center gap-2">
            {LABEL[flag]}
            <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-900 shadow-sm tabular-nums">
              {done(flag)} / {lines.length}
            </span>
          </span>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {groups.map((g) => {
        const many = g.orders.length > 1;
        const expanded = many && (expandAll || open.has(g.sku));
        const count = (flag: Flag) => g.orders.filter((o) => o[flag]).length;
        const all = (flag: Flag) => count(flag) === g.orders.length;
        const codes = g.orders.map((o) => o.code);
        return (
          <section key={g.sku} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-4 p-4">
              <div className="flex w-24 items-center gap-2">
                {many ? (
                  <button
                    type="button"
                    onClick={() => toggle(g.sku)}
                    aria-label={expanded ? 'Свернуть заказы' : 'Развернуть заказы'}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
                  >
                    {expanded ? '⌄' : '›'}
                  </button>
                ) : (
                  <span className="w-9" />
                )}
                <span className="text-lg font-semibold whitespace-nowrap">{g.quantity} шт</span>
              </div>
              {g.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- фото с CDN Kaspi, без оптимизации Next
                <img src={g.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 object-contain" />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-2xl text-slate-300">📦</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-slate-900">{g.name}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {[g.categoryTitle, g.brand, `Артикул: ${g.sku}`].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {(['collected', 'packed'] as const).map((flag) => (
                  <Check
                    key={flag}
                    label={many ? `${LABEL[flag]} всё` : LABEL[flag]}
                    sub={many ? `Сейчас ${count(flag)}/${g.orders.length}` : undefined}
                    checked={all(flag)}
                    onChange={(value) => mark(g.sku, codes, flag, value)}
                  />
                ))}
                {many ? (
                  <button
                    type="button"
                    onClick={() => toggle(g.sku)}
                    title="Накладные — в списке заказов"
                    className="inline-flex h-10 items-center gap-1 rounded-lg bg-slate-100 px-3 text-sm hover:bg-slate-200"
                  >
                    🖨 {g.orders.length}
                  </button>
                ) : (
                  <PrintLink shopId={shopId} code={g.orders[0]!.code} />
                )}
              </div>
            </div>

            {!many && (
              <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3 pl-4 md:pl-32">
                <OrderCode code={g.orders[0]!.code} />
                {g.orders[0]!.express && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Экспресс</span>}
              </div>
            )}

            {expanded &&
              g.orders.map((o, i) => (
                <div key={o.code} className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-4 py-3 pl-4 md:pl-32">
                  <OrderCode code={o.code} index={i + 1} />
                  {o.quantity > 1 && <span className="text-sm font-semibold text-slate-700">× {o.quantity} шт</span>}
                  {o.express && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Экспресс</span>}
                  <div className="flex-1" />
                  {(['collected', 'packed'] as const).map((flag) => (
                    <Check key={flag} label={LABEL[flag]} checked={o[flag]} onChange={(value) => mark(g.sku, [o.code], flag, value)} />
                  ))}
                  <PrintLink shopId={shopId} code={o.code} />
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}
