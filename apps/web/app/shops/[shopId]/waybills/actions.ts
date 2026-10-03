'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export interface PrintState {
  result?: { count: number; notReady: number; unreadable: number; batchId?: string; href?: string };
  /** Итоги по магазинам, когда склеивались несколько. */
  perShop?: { name: string; count: number; notReady: number; error?: string }[];
  error?: string;
}

const LAYOUTS = new Set(['thermal', 'a4x4', 'a4x8']);

export async function reprintBatch(_prev: PrintState, formData: FormData): Promise<PrintState> {
  const shopId = String(formData.get('shopId'));
  const batchId = String(formData.get('batchId'));
  const layout = String(formData.get('layout'));
  if (!LAYOUTS.has(layout)) return { error: 'Неизвестный формат печати.' };

  try {
    const result = await api<NonNullable<PrintState['result']>>(`/waybill-batches/${batchId}/reprint`, {
      method: 'POST',
      body: { layout },
    });
    revalidatePath(`/shops/${shopId}/waybills`);
    return { result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось пересобрать.' };
  }
}

export interface Candidate {
  code: string;
  city: string | null;
  express: boolean;
  createdAt: string;
  printed: boolean;
  items: { sku: string; name: string; quantity: number }[];
}

/** Заказы из «Передачи» для фильтров печати. */
export async function loadCandidates(shopId: string): Promise<{ orders?: Candidate[]; error?: string }> {
  try {
    return { orders: await api<Candidate[]>(`/shops/${shopId}/waybills/candidates`) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось загрузить заказы.' };
  }
}

/** Дата из поля формы (YYYY-MM-DD) как начало или конец суток по Алматы. */
const almatyBoundary = (value: FormDataEntryValue | null, end: boolean) => {
  const date = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  return `${date}T${end ? '23:59:59.999' : '00:00:00'}+05:00`;
};

type PrintResult = NonNullable<PrintState['result']>;

/**
 * Склейка по выбранным магазинам. У каждого магазина своя склейка и свои
 * отметки о печати; если накладные есть в нескольких, они отдаются одним файлом.
 */
export async function printWaybills(_prev: PrintState, formData: FormData): Promise<PrintState> {
  const shopId = String(formData.get('shopId'));
  const layout = String(formData.get('layout'));
  if (!LAYOUTS.has(layout)) return { error: 'Неизвестный формат печати.' };
  const list = (name: string) => formData.getAll(name).map(String).filter(Boolean);
  const shopIds = list('shopIds');
  if (shopIds.length === 0) shopIds.push(shopId);

  const common = {
    layout,
    sort: String(formData.get('sort') ?? 'product'),
    onlyNew: formData.get('onlyNew') === 'on',
    excludeExpress: formData.get('excludeExpress') === 'on',
    createdFrom: almatyBoundary(formData.get('createdFrom'), false),
    createdTo: almatyBoundary(formData.get('createdTo'), true),
    cities: list('cities'),
  };
  // Фильтры по товарам и номерам заказов загружены из текущего магазина — только к нему
  const own = { skus: list('skus'), orderCodes: list('orderCodes') };

  const shops = await api<{ id: string; name: string }[]>('/shops');
  const settled = await Promise.allSettled(
    shopIds.map((id) => api<PrintResult>(`/shops/${id}/waybills`, { method: 'POST', body: id === shopId ? { ...common, ...own } : common })),
  );
  const perShop = settled.map((r, i) => ({
    name: shops.find((s) => s.id === shopIds[i])?.name ?? shopIds[i]!,
    ...(r.status === 'fulfilled' ? r.value : { count: 0, notReady: 0, unreadable: 0 }),
    error: r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : 'ошибка') : undefined,
  }));
  if (perShop.every((s) => s.error)) return { error: perShop.map((s) => `${s.name}: ${s.error}`).join('; ') };

  const batchIds = perShop.filter((s) => s.count > 0 && s.batchId).map((s) => s.batchId!);
  revalidatePath(`/shops/${shopId}/waybills`);
  return {
    result: {
      count: perShop.reduce((n, s) => n + s.count, 0),
      notReady: perShop.reduce((n, s) => n + s.notReady, 0),
      unreadable: perShop.reduce((n, s) => n + s.unreadable, 0),
      batchId: batchIds.length === 1 ? batchIds[0] : undefined,
      href:
        batchIds.length > 1
          ? `/shops/${shopId}/waybills/combined/pdf?ids=${batchIds.join(',')}`
          : batchIds.length === 1
            ? `/shops/${shopId}/waybills/${batchIds[0]}/pdf`
            : undefined,
    },
    perShop: shopIds.length > 1 ? perShop.map(({ name, count, notReady, error }) => ({ name, count, notReady, error })) : undefined,
  };
}
