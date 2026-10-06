'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { editOffer } from './actions';

export interface StoreView {
  storeId: string;
  available: boolean;
  stockCount: number | null;
  preOrder: number | null;
}

/**
 * Значение с карандашом ✎: по нажатию — окошко с полем, «Отмена» и «Сохранить», как в Okto.
 * Сохраняет сразу в Kaspi; пока идёт запрос, кнопка неактивна, ошибка показывается в окошке.
 */
function EditPopover({
  label,
  hint,
  initial,
  children,
  onSave,
}: {
  label: string;
  hint?: string;
  initial: string;
  children: ReactNode;
  onSave: (value: string) => Promise<{ error?: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  return (
    <span className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          setValue(initial);
          setError(undefined);
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 rounded hover:bg-white/70"
        title={`Изменить: ${label}`}
      >
        {children}
        <span className="text-xs text-slate-400" aria-hidden>
          ✎
        </span>
      </button>
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await onSave(value);
              if (r.error) setError(r.error);
              else setOpen(false);
            });
          }}
          className="absolute top-full right-0 z-30 mt-1 w-60 space-y-2 rounded-xl bg-slate-900 p-3 text-left text-sm font-normal text-white shadow-xl"
        >
          <div className="text-xs font-semibold text-slate-300">{label}</div>
          <input
            autoFocus
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-right text-white tabular-nums"
          />
          {hint && <div className="text-xs text-slate-400">{hint}</div>}
          {error && <div className="text-xs text-red-300">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-slate-600 py-1.5">
              Отмена
            </button>
            <button type="submit" disabled={pending} className="flex-1 rounded-lg bg-cyan-400 py-1.5 font-semibold text-slate-900 disabled:opacity-50">
              {pending ? '…' : 'Сохранить'}
            </button>
          </div>
        </form>
      )}
    </span>
  );
}

/** Цена в таблице с правкой — уходит в Kaspi сразу. */
export function PriceEdit({ shopId, productId, price }: { shopId: string; productId: string; price: number }) {
  return (
    <EditPopover
      label="Цена, ₸"
      hint="Сразу меняется в Kaspi. Если робот включён, он продолжит менять цену сам."
      initial={String(price)}
      onSave={(value) => editOffer(shopId, productId, { kind: 'price', value })}
    >
      {price.toLocaleString('ru-RU')} ₸
    </EditPopover>
  );
}

/** Склады товара: наличие (переключатель) и остаток с правкой. */
export function StoresCell({ shopId, productId, stores }: { shopId: string; productId: string; stores: StoreView[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  if (stores.length === 0) return <span className="text-xs text-slate-400">нет данных — синхронизируйте</span>;

  return (
    <div className="space-y-1.5">
      {stores.map((s) => (
        <div key={s.storeId} className="flex items-center justify-end gap-2 text-sm whitespace-nowrap">
          <span className="text-xs font-medium text-slate-500">{s.storeId.split('_').pop()}</span>
          <button
            type="button"
            role="switch"
            aria-checked={s.available}
            aria-label={`Наличие на складе ${s.storeId}`}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await editOffer(shopId, productId, { kind: 'availability', storeId: s.storeId, value: !s.available });
                setError(r.error);
              })
            }
            className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-50 ${s.available ? 'bg-blue-600' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${s.available ? 'left-4.5' : 'left-0.5'}`} />
          </button>
          {s.preOrder ? (
            <span className="text-xs font-medium text-indigo-700">предзаказ {s.preOrder} д.</span>
          ) : (
            <EditPopover
              label={`Остаток на ${s.storeId.split('_').pop()}, шт`}
              hint="Пусто — без учёта остатков. Вписанный остаток снимает предзаказ, если в колонке «Предзаказ» дни не указаны."
              initial={s.stockCount === null ? '' : String(s.stockCount)}
              onSave={(value) => editOffer(shopId, productId, { kind: 'stock', storeId: s.storeId, value })}
            >
              <span className={`tabular-nums ${s.available && s.stockCount === 0 ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                {s.stockCount === null ? '—' : `${s.stockCount} шт.`}
              </span>
            </EditPopover>
          )}
        </div>
      ))}
      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}
