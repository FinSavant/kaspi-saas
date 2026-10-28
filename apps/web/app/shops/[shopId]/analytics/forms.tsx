'use client';

import { useActionState, type FocusEvent } from 'react';
import { saveCommission, saveCost, saveExpenses, saveFees, syncOrders, type FormState } from './actions';

const INPUT = 'w-24 rounded border border-slate-300 px-2 py-1 text-right tabular-nums';

function Status({ state, pending }: { state: FormState; pending: boolean }) {
  if (pending) return <span className="text-xs whitespace-nowrap text-slate-500">Сохраняю…</span>;
  if (state.error) return <span className="text-xs text-red-600">{state.error}</span>;
  if (state.ok) return <span className="text-xs whitespace-nowrap text-emerald-700">✓</span>;
  return null;
}

/** Автосохранение: форма отправляется, когда из поля уходят (или по Enter), если значение изменилось. */
const saveIfChanged = (e: FocusEvent<HTMLInputElement>) => {
  if (e.target.value.trim() !== e.target.defaultValue) e.target.form?.requestSubmit();
};

/** Себестоимость товара: по карточке, а если товара нет в каталоге — по артикулу из продаж. */
export function CostForm({
  shopId,
  productId,
  sku,
  costPrice,
}: {
  shopId: string;
  productId: string | null;
  sku: string;
  costPrice: number | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCost, {});
  return (
    <form action={action} className="flex items-center justify-end gap-1">
      <input type="hidden" name="shopId" value={shopId} />
      <input type="hidden" name="productId" value={productId ?? ''} />
      <input type="hidden" name="sku" value={sku} />
      <input name="costPrice" inputMode="numeric" defaultValue={costPrice ?? ''} onBlur={saveIfChanged} placeholder="₸" aria-label="Себестоимость" className={INPUT} />
      <Status state={state} pending={pending} />
    </form>
  );
}

export function CommissionForm({
  shopId,
  category,
  title,
  percent,
}: {
  shopId: string;
  category: string;
  title: string | null;
  percent: number | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCommission, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="shopId" value={shopId} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="title" value={title ?? ''} />
      <input name="percent" inputMode="decimal" defaultValue={percent ?? ''} onBlur={saveIfChanged} placeholder="%" aria-label={`Комиссия: ${title ?? category}`} className="w-20 rounded border border-slate-300 px-2 py-1 text-right tabular-nums" />
      <span className="text-sm text-slate-500">%</span>
      <Status state={state} pending={pending} />
    </form>
  );
}

export function FeesForm({
  shopId,
  commissionVatPercent,
  paymentFeePercent,
  taxPercent,
}: {
  shopId: string;
  commissionVatPercent: number;
  paymentFeePercent: number;
  taxPercent: number;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveFees, {});
  const field = 'w-20 rounded border border-slate-300 px-2 py-1 text-right tabular-nums';
  return (
    <form action={action} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <input type="hidden" name="shopId" value={shopId} />
      <label className="flex items-center gap-2">
        НДС на комиссию Kaspi
        <input name="commissionVatPercent" inputMode="decimal" defaultValue={commissionVatPercent} onBlur={saveIfChanged} className={field} />%
      </label>
      <label className="flex items-center gap-2">
        Kaspi Pay от суммы продажи
        <input name="paymentFeePercent" inputMode="decimal" defaultValue={paymentFeePercent} onBlur={saveIfChanged} className={field} />%
      </label>
      <label className="flex items-center gap-2" title="Ваш налог от выручки, например 4% по упрощённой декларации. 0 — не учитывать.">
        Налог от выручки
        <input name="taxPercent" inputMode="decimal" defaultValue={taxPercent} onBlur={saveIfChanged} className={field} />%
      </label>
      <Status state={state} pending={pending} />
    </form>
  );
}

const MAX_EXPENSES = 4;

/** Свои расходы продавца: до 4 строк «название + % от выручки». Сохраняются кнопкой. */
export function ExpensesForm({ shopId, expenses }: { shopId: string; expenses: { name: string; percent: number }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveExpenses, {});
  const rows = [...expenses, ...Array.from({ length: MAX_EXPENSES - expenses.length }, () => ({ name: '', percent: 0 }))].slice(0, MAX_EXPENSES);
  return (
    <form action={action} className="space-y-2 text-sm">
      <input type="hidden" name="shopId" value={shopId} />
      {rows.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            name="expenseName"
            defaultValue={e.name}
            placeholder={['Реклама', 'Упаковка', 'Зарплата', 'Прочее'][i]}
            maxLength={40}
            aria-label={`Расход ${i + 1}: название`}
            className="w-48 rounded border border-slate-300 px-2 py-1"
          />
          <input
            name="expensePercent"
            inputMode="decimal"
            defaultValue={e.percent || ''}
            placeholder="0"
            aria-label={`Расход ${i + 1}: процент от выручки`}
            className="w-20 rounded border border-slate-300 px-2 py-1 text-right tabular-nums"
          />
          <span className="text-slate-500">% от выручки</span>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={pending} className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          Сохранить расходы
        </button>
        <Status state={state} pending={pending} />
      </div>
    </form>
  );
}

export function SyncOrdersButton({ shopId, syncing }: { shopId: string; syncing: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(syncOrders, {});
  const running = syncing || (state.ok && !pending);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="shopId" value={shopId} />
      <button
        type="submit"
        disabled={pending || syncing}
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
      >
        {running ? 'Заказы загружаются…' : 'Обновить заказы'}
      </button>
      {running && <span className="text-xs text-slate-500">Первая загрузка за 3 месяца — несколько минут. Обновите страницу позже.</span>}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
