'use client';

import { useActionState, type FocusEvent } from 'react';
import { saveMarkups, type SaveState } from './actions';

/** Варианты наценки для «Мин. с наценкой»: до трёх процентов, сохраняются при уходе с поля. */
export function MarkupForm({ shopId, percents }: { shopId: string; percents: number[] }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveMarkups, {});
  const values = [...percents, null, null, null].slice(0, 3);
  const saveIfChanged = (e: FocusEvent<HTMLInputElement>) => {
    if (e.currentTarget.value !== e.currentTarget.defaultValue) e.currentTarget.form?.requestSubmit();
  };
  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-2 text-sm"
      title="Цена, ниже которой прибыль меньше выбранного процента от цены. Измените числа — колонка «Мин. с наценкой» пересчитается сама."
    >
      <input type="hidden" name="shopId" value={shopId} />
      <span className="text-slate-600">Наценка для мин. цены:</span>
      {values.map((v, i) => (
        <label key={i} className="flex items-center gap-0.5">
          +
          <input
            name="markup"
            inputMode="numeric"
            defaultValue={v ?? ''}
            onBlur={saveIfChanged}
            placeholder="—"
            aria-label={`Вариант наценки ${i + 1}, %`}
            className="w-12 rounded border border-rose-300 px-1.5 py-1 text-right font-semibold text-rose-800 tabular-nums"
          />
          %
        </label>
      ))}
      {pending && <span className="text-xs text-slate-400">сохраняю…</span>}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
