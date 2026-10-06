'use client';

import { useActionState, useRef, type FocusEvent } from 'react';
import { saveProduct, syncProducts, type SaveState, type SyncState } from './actions';
import { RowCheckbox } from './Bulk';
import { PriceEdit, StoresCell, type StoreView } from './InlineEdit';
import { COL } from './columns';

export interface ProductView {
  id: string;
  kaspiSku: string;
  kaspiMasterSku: string | null;
  name: string;
  imageUrl: string | null;
  shopUrl: string | null;
  /** Цена, ниже которой прибыль меньше 5%; null — нет себестоимости или комиссии. */
  minProfitablePrice: number | null;
  /** Вес, кг: из карточки Kaspi или введённый вручную. */
  weightKg: number | null;
  /** Доставка по тарифу Kaspi при этой цене, ₸. */
  minPriceDelivery: number | null;
  /** Склады из кабинета; null — ещё не синхронизировались. */
  stores: StoreView[] | null;
  price: number;
  costPrice: number | null;
  stock: number;
  available: boolean;
  sellersCount: number | null;
  /** Настройка автопредзаказа, дней. */
  preorderDays: number | null;
  /** Сейчас на предзаказе в Kaspi, дней. */
  preOrder: number | null;
  /** Место по цене в карточке по последней проверке (null — не проверялось за сутки). */
  position: number | null;
  /** Самая низкая цена конкурента по последней проверке. */
  topCompetitorPrice: number | null;
  repricerSetting: {
    enabled: boolean;
    floorPrice: number;
    ceilingPrice: number | null;
    step: number;
  } | null;
}

const INPUT = 'w-24 rounded border bg-white px-2 py-1 text-right tabular-nums';

/** Карточка на витрине kaspi.kz: ссылка из кабинета, иначе по номеру общей карточки. */
const shopUrl = (p: ProductView) => p.shopUrl ?? (p.kaspiMasterSku ? `https://kaspi.kz/shop/p/-${p.kaspiMasterSku}/` : null);

const PILL ='inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap';

/**
 * Позиция по цене в карточке, как в Okto: «Топ 1» зелёная плашка, «Ниже №1» красная
 * с местом; без конкурентов и без проверки — серые. Подпись — число продавцов.
 */
function PositionCell({ product }: { product: ProductView }) {
  const { position, sellersCount } = product;
  const sellers = sellersCount !== null && sellersCount > 1 && (
    <div className="mt-1 text-xs whitespace-nowrap text-slate-500">продавцов: {sellersCount}</div>
  );
  if (position === 1) {
    return (
      <>
        <span className={`${PILL} bg-emerald-500 text-white`}>Топ 1 ✓</span>
        {sellers}
      </>
    );
  }
  if (position !== null) {
    return (
      <>
        <span className={`${PILL} bg-red-500 text-white`}>Ниже №1</span>
        <div className="mt-1 text-xs font-medium whitespace-nowrap text-red-600">сейчас №{position}</div>
        {sellers}
      </>
    );
  }
  if (sellersCount === 1) return <span className={`${PILL} bg-slate-100 text-slate-500`}>Нет конкурентов</span>;
  return (
    <>
      <span className={`${PILL} bg-slate-100 text-slate-400`}>—</span>
      <div className="mt-1 text-xs whitespace-nowrap text-slate-400">{botOnLabel(product)}</div>
      {sellers}
    </>
  );
}

const botOnLabel = (p: ProductView) => (p.repricerSetting?.enabled ? 'ждёт проверки' : 'бот выкл');

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
      <td className="py-2 pl-3">
        <RowCheckbox id={product.id} />
      </td>
      <td className="max-w-xs px-3 py-2">
        <form id={formId} ref={formRef} action={action}>
          <input type="hidden" name="shopId" value={shopId} />
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="hasSetting" value={setting ? '1' : '0'} />
        </form>
        <div className="flex items-center gap-3">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- фото с CDN Kaspi, без оптимизации Next
            <img src={product.imageUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 bg-white object-contain" />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-300">📦</div>
          )}
          {shopUrl(product) ? (
            <a
              href={shopUrl(product)!}
              target="_blank"
              rel="noreferrer"
              title="Открыть карточку на kaspi.kz"
              className="font-medium text-slate-900 hover:text-sky-700 hover:underline"
            >
              {product.name} <span className="text-xs text-slate-400">↗</span>
            </a>
          ) : (
            <span className="font-medium text-slate-900">{product.name}</span>
          )}
        </div>
        {state.error && <div className="mt-1 text-xs text-red-600">{state.error}</div>}
      </td>
      <td className={`${COL.price} px-3 py-2 text-right text-base font-bold text-sky-800 tabular-nums`}>
        <PriceEdit shopId={shopId} productId={product.id} price={product.price} />
        {/* Как в Okto: под нашей ценой — цена первого места, если мы не первые */}
        {product.position !== null && product.position > 1 && product.topCompetitorPrice !== null && (
          <div className="text-xs font-normal text-slate-500" title="Цена первого места">
            {product.topCompetitorPrice.toLocaleString('ru-RU')} ₸
          </div>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <PositionCell product={product} />
      </td>
      <td className="px-3 py-2 text-right">
        <StoresCell shopId={shopId} productId={product.id} stores={product.stores ?? []} />
      </td>
      <td className={`${COL.cost} px-3 py-2 text-right`}>
        <input {...field} name="costPrice" defaultValue={product.costPrice ?? ''} placeholder="₸" aria-label="Себестоимость" className={`${INPUT} border-rose-300 font-semibold text-rose-800`} />
      </td>
      <td
        className={`${COL.cost} px-3 py-2 text-right whitespace-nowrap tabular-nums`}
        title={
          product.minProfitablePrice === null
            ? 'Укажите себестоимость — тогда посчитаю цену, ниже которой прибыль меньше 5%'
            : `Ниже этой цены прибыль меньше 5% после комиссии с НДС, Kaspi Pay и доставки ${product.minPriceDelivery} ₸ по тарифу Kaspi для такой суммы заказа`
        }
      >
        {product.minProfitablePrice === null ? (
          <span className="text-xs text-slate-400">—</span>
        ) : (
          <>
            <span className="font-bold text-rose-800">{product.minProfitablePrice.toLocaleString('ru-RU')} ₸</span>
            {setting && setting.floorPrice < product.minProfitablePrice && (
              <div className="text-[11px] font-semibold text-red-600">мин. цена ниже!</div>
            )}
          </>
        )}
        {/* Для заказов от 10 000 ₸ доставка Kaspi зависит от веса */}
        {product.price >= 8000 && (
          <label className="mt-1 flex items-center justify-end gap-1 text-[11px] font-normal text-slate-500" title="Вес для тарифа доставки Kaspi. Пусто — из карточки (или «до 5 кг»)">
            вес
            <input
              {...field}
              inputMode="decimal"
              name="weightKg"
              defaultValue={product.weightKg ?? ''}
              placeholder="кг"
              className="w-12 rounded border border-slate-300 bg-white px-1 py-0.5 text-right"
            />
            кг
          </label>
        )}
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
      <td className={`${COL.preorder} px-3 py-2 text-right`}>
        <input
          {...field}
          name="preorderDays"
          defaultValue={product.preorderDays ?? ''}
          placeholder="—"
          title="Товар сразу встанет на предзаказ на столько дней (1–30, больше Kaspi не принимает) остатки сохранятся; Kaspi применяет минут через 10–15. Закончится — останется на предзаказе. Очистить — снять предзаказ."
          aria-label="Предзаказ, дней"
          className="w-14 rounded border border-indigo-300 bg-white px-2 py-1 text-right text-indigo-900 tabular-nums"
        />
        {product.preorderDays && product.preOrder !== product.preorderDays ? (
          <div className="mt-1 text-xs whitespace-nowrap text-slate-500">ставлю в Kaspi…</div>
        ) : product.preOrder ? (
          <div className="mt-1 text-xs font-medium whitespace-nowrap text-indigo-700">на предзаказе · {product.preOrder} д.</div>
        ) : !product.available ? (
          <div className="mt-1 text-xs whitespace-nowrap text-slate-500">снят с продажи</div>
        ) : null}
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
