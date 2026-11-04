'use client';

import { useActionState, type FocusEvent } from 'react';
import { saveMarkups, type SaveState } from './actions';

/**
 * Один процент наценки для колонки «Себестоимость + %» — в шапке колонки. Продавец вводит любое
 * целое число вручную; сохраняется при уходе с поля, цены в колонке пересчитываются.
 */
export function MarkupForm({ shopId, percent }: { shopId: string; percent: number }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveMarkups, {});
  const saveIfChanged = (e: FocusEvent<HTMLInputElement>) => {
    if (e.currentTarget.value !== e.currentTarget.defaultValue) e.currentTarget.form?.requestSubmit();
  };
  return (
    <form
      action={action}
      className="flex flex-col items-end gap-1 font-normal normal-case"
      title="Только для ориентира: себестоимость плюс ваш процент. Робот опирается на колонку «Мин. цена»."
    >
      <input type="hidden" name="shopId" value={shopId} />
      <span className="font-bold uppercase">Себестоимость +</span>
      <span className="flex items-center gap-0.5 text-sm">
        +
        <input
          name="markup"
          inputMode="numeric"
          defaultValue={percent}
          key={percent}
          onBlur={saveIfChanged}
          placeholder="5"
          aria-label="Процент наценки к минимальной цене"
          className="w-20 rounded border border-rose-300 bg-white px-1.5 py-1 text-right font-semibold text-rose-800 tabular-nums"
        />
        %
      </span>
      <span className="text-[10px] font-normal text-slate-500">цена не ниже</span>
      {pending && <span className="text-[11px] text-slate-400">сохраняю…</span>}
      {state.error && <span className="max-w-40 text-[11px] text-red-600">{state.error}</span>}
    </form>
  );
}
