'use client';

import { useActionState, useState, useTransition, type FocusEvent } from 'react';
import { saveWbCost, saveWbTax, saveWbToken, syncWb, type FormState } from './actions';

function Status({ state, pending, okText = '✓ Сохранено' }: { state: FormState; pending: boolean; okText?: string }) {
  if (pending) return <span className="text-xs text-slate-500">Сохраняю…</span>;
  if (state.error) return <span className="text-xs text-red-600">{state.error}</span>;
  if (state.ok) return <span className="text-xs text-emerald-700">{okText}</span>;
  return null;
}

/** Токен вводит сам продавец; на страницу он не возвращается. */
export function TokenForm({ shopId, replace = false }: { shopId: string; replace?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveWbToken, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="shopId" value={shopId} />
      <input
        name="token"
        type="password"
        autoComplete="off"
        placeholder="Токен API Wildberries"
        className="w-full max-w-md rounded border border-slate-300 bg-white px-3 py-1.5 text-sm"
      />
      <button type="submit" disabled={pending} className="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-60">
        {replace ? 'Заменить токен' : 'Подключить'}
      </button>
      <Status state={state} pending={pending} okText="✓ Подключено — загружаю отчёт WB, это до нескольких минут. Обновите страницу позже." />
    </form>
  );
}

export function SyncWbButton({ shopId }: { shopId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(syncWb, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="shopId" value={shopId} />
      <button type="submit" disabled={pending} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50">
        Обновить из WB
      </button>
      <Status state={state} pending={pending} okText="Загружаю — обновите страницу через пару минут" />
    </form>
  );
}

export function TaxForm({ shopId, taxPercent }: { shopId: string; taxPercent: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveWbTax, {});
  const save = (e: FocusEvent<HTMLInputElement>) => {
    if (e.target.value.trim() !== e.target.defaultValue) e.target.form?.requestSubmit();
  };
  return (
    <form action={action} className="flex items-center gap-2 text-sm">
      <input type="hidden" name="shopId" value={shopId} />
      <label className="flex items-center gap-2" title="Ваш налог от реализованного, например 4% по упрощённой декларации">
        Налог от выручки
        <input name="taxPercent" inputMode="decimal" defaultValue={taxPercent} onBlur={save} className="w-16 rounded border border-slate-300 px-2 py-1 text-right tabular-nums" />%
      </label>
      <Status state={state} pending={pending} />
    </form>
  );
}

/** Себестоимость за штуку: сохраняется, когда уходят из поля. */
export function CostInput({ shopId, nmId, value }: { shopId: string; nmId: string; value: number | null }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>({});
  const save = (e: FocusEvent<HTMLInputElement>) => {
    const next = e.target.value.trim();
    if (next === e.target.defaultValue) return;
    start(async () => setState(await saveWbCost(shopId, nmId, next)));
  };
  return (
    <div className="flex flex-col items-end">
      <input
        defaultValue={value ?? ''}
        inputMode="decimal"
        placeholder="—"
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label="Себестоимость за штуку"
        className="w-24 rounded border border-rose-300 bg-white px-2 py-1 text-right font-semibold text-rose-800 tabular-nums"
      />
      {pending ? <span className="text-[11px] text-slate-500">…</span> : state.error ? <span className="text-[11px] text-red-600">{state.error}</span> : null}
    </div>
  );
}
