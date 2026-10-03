'use client';

import { useActionState, useRef, type FocusEvent } from 'react';
import { saveProduct, syncProducts, type SaveState, type SyncState } from './actions';
import { COL } from './columns';

export interface ProductView {
  id: string;
  kaspiSku: string;
  name: string;
  price: number;
  costPrice: number | null;
  stock: number;
  sellersCount: number | null;
  repricerSetting: {
    enabled: boolean;
    floorPrice: number;
    ceilingPrice: number | null;
    step: number;
  } | null;
}

const INPUT = 'w-24 rounded border bg-white px-2 py-1 text-right tabular-nums';

function SellersBadge({ count }: { count: number | null }) {
  if (count === null) return <span className="text-xs text-slate-400">не проверено</span>;
  return count > 1 ? (
    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-violet-800">
      открытая · {count}
    </span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs whitespace-nowrap text-slate-500">только вы</span>
  );
}

/**
 * Строка товара сохраняется сама: поле — когда из него уходят (или по Enter), если
 * значение изменилось; галочка бота — сразу при нажатии.
 */
export function ProductRow({ shopId, product }: { shopId: string; product: ProductView }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveProduct, {});
  const formRef = useRef<HTMLFormElement>(null);
  const setting = product.repricerSetting;
  const formId = `product-${product.id}`;

  const save = () => formRef.current?.requestSubmit();
  const saveIfChanged = (e: FocusEvent<HTMLInputElement>) => {
    if (e.target.value.trim() !== e.target.defaultValue) save();
  };
  const field = { form: formId, inputMode: 'numeric' as const, onBlur: saveIfChanged };

  return (
    <tr className="border-t border-slate-200 align-middle hover:bg-slate-50">
      <td className="max-w-xs px-3 py-2">
        <form id={formId} ref={formRef} action={action}>
          <input type="hidden" name="shopId" value={shopId} />
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="hasSetting" value={setting ? '1' : '0'} />
        </form>
        <div className="font-medium text-slate-900">{product.name}</div>
        {state.error && <div className="mt-1 text-xs text-red-600">{state.error}</div>}
      </td>
      <td className="px-3 py-2">
        <SellersBadge count={product.sellersCount} />
      </td>
      <td className={`${COL.price} px-3 py-2 text-right text-base font-bold text-sky-800 tabular-nums`}>
        {product.price.toLocaleString('ru-RU')}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${product.stock === 0 ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
        {product.stock}
      </td>
      <td className={`${COL.cost} px-3 py-2 text-right`}>
        <input {...field} name="costPrice" defaultValue={product.costPrice ?? ''} placeholder="₸" aria-label="Себестоимость" className={`${INPUT} border-rose-300 font-semibold text-rose-800`} />
      </td>
      <td className={`${COL.bot} px-3 py-2 text-right`}>
        <input {...field} name="floorPrice" defaultValue={setting?.floorPrice ?? ''} placeholder="₸" aria-label="Минимальная цена" className={`${INPUT} border-amber-400 font-bold text-amber-900`} />
      </td>
      <td className={`${COL.bot} px-3 py-2 text-right`}>
        <input {...field} name="ceilingPrice" defaultValue={setting?.ceilingPrice ?? ''} placeholder="₸" aria-label="Максимальная цена" className={`${INPUT} border-amber-300 text-amber-900`} />
      </td>
      <td className={`${COL.bot} px-3 py-2 text-right`}>
        <input {...field} name="step" defaultValue={setting?.step ?? 1} aria-label="Шаг" className="w-14 rounded border border-amber-300 bg-white px-2 py-1 text-right text-amber-900 tabular-nums" />
      </td>
      <td className={`${COL.toggle} px-3 py-2 text-center`}>
        <input form={formId} type="checkbox" name="enabled" defaultChecked={setting?.enabled ?? false} onChange={save} aria-label="Бот включён" className="h-5 w-5 accent-emerald-600" />
      </td>
      <td className="w-24 py-2 text-xs whitespace-nowrap">
        {pending ? (
          <span className="text-slate-500">Сохраняю…</span>
        ) : state.error ? (
          <span className="text-red-600">Не сохранено</span>
        ) : state.ok ? (
          <span className="text-emerald-700">✓ Сохранено</span>
        ) : null}
      </td>
    </tr>
  );
}

export function SyncButton({ shopId }: { shopId: string }) {
  const [state, action, pending] = useActionState<SyncState, FormData>(syncProducts, {});
  const result = state.result;

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="shopId" value={shopId} />
      <button type="submit" disabled={pending} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50">
        {pending ? 'Синхронизирую… (около минуты)' : 'Синхронизировать товары с Kaspi'}
      </button>
      {result && (
        <span className="text-sm text-emerald-700">
          В продаже: {result.onSale}. Новых: {result.created}, обновлено: {result.updated}
          {result.removedFromSale > 0 ? `, снято с продажи: ${result.removedFromSale}` : ''}.
        </span>
      )}
      {state.error && <span className="max-w-md text-right text-sm text-red-600">{state.error}</span>}
    </form>
  );
}
