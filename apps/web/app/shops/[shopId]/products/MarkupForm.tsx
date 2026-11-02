'use client';

import { useActionState, useRef, type FocusEvent } from 'react';
import { saveMarkups, type SaveState } from './actions';

const QUICK = [5, 6, 10];

/**
 * Один процент наценки для колонки «Мин. цена + %» — в шапке колонки. Продавец вводит любое
 * целое число или жмёт быстрый вариант; сохраняется при уходе с поля, цены в колонке пересчитываются.
 */
export function MarkupForm({ shopId, percent }: { shopId: string; percent: number }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveMarkups, {});
  const inputRef = useRef<HTMLInputElement>(null);
  const saveIfChanged = (e: FocusEvent<HTMLInputElement>) => {
    if (e.currentTarget.value !== e.currentTarget.defaultValue) e.currentTarget.form?.requestSubmit();
  };
  const pick = (n: number) => {
    const input = inputRef.current;
    if (!input) return;
    input.value = String(n);
    input.form?.requestSubmit();
  };
  return (
    <form
      action={action}
      className="flex flex-col items-end gap-1 font-normal normal-case"
      title="Минимальная цена, при которой прибыль не меньше этого процента от цены. Введите число или выберите быстрый вариант — цены в колонке пересчитаются сами."
    >
      <input type="hidden" name="shopId" value={shopId} />
      <span className="font-bold uppercase">Мин. цена +</span>
      <span className="flex items-center gap-0.5 text-sm">
        +
        <input
          ref={inputRef}
          name="markup"
          inputMode="numeric"
          defaultValue={percent}
          key={percent}
          onBlur={saveIfChanged}
          placeholder="5"
          aria-label="Процент наценки к минимальной цене"
          className="w-12 rounded border border-rose-300 bg-white px-1.5 py-1 text-right font-semibold text-rose-800 tabular-nums"
        />
        %
      </span>
      <span className="flex gap-1">
        {QUICK.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => pick(n)}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${n === percent ? 'border-rose-600 bg-rose-600 text-white' : 'border-rose-300 bg-white text-rose-700 hover:bg-rose-100'}`}
          >
            {n}%
          </button>
        ))}
      </span>
      {pending && <span className="text-[11px] text-slate-400">сохраняю…</span>}
      {state.error && <span className="max-w-40 text-[11px] text-red-600">{state.error}</span>}
    </form>
  );
}
