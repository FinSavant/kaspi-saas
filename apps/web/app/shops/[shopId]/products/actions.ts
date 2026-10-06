'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export interface SaveState {
  ok?: boolean;
  error?: string;
}

/** Пустое поле — null; иначе целое неотрицательное число или ошибка. */
function parseTenge(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? '').replace(/\s/g, '');
  if (raw === '') return null;
  if (!/^\d+$/.test(raw)) throw new Error('Цены вводятся целыми числами в тенге.');
  return Number(raw);
}

export async function saveProduct(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const shopId = String(formData.get('shopId'));
  const productId = String(formData.get('productId'));
  const hasSetting = formData.get('hasSetting') === '1';
  const enabled = formData.get('enabled') === 'on';

  try {
    const costPrice = parseTenge(formData, 'costPrice');
    const floorPrice = parseTenge(formData, 'floorPrice');
    const ceilingPrice = parseTenge(formData, 'ceilingPrice');
    const step = parseTenge(formData, 'step');
    const preorderRaw = String(formData.get('preorderDays') ?? '').trim();
    if (preorderRaw !== '' && !/^\d{1,2}$/.test(preorderRaw)) throw new Error('Предзаказ — число дней, например 3.');
    const preorderDays = preorderRaw === '' || preorderRaw === '0' ? null : Number(preorderRaw);
    if (preorderDays !== null && preorderDays > 30) throw new Error('Предзаказ — не больше 30 дней: больше Kaspi не принимает.');

    if (enabled && !floorPrice) return { error: 'Чтобы включить бота, укажите минимальную цену.' };
    if (floorPrice && ceilingPrice && ceilingPrice < floorPrice) {
      return { error: 'Максимальная цена не может быть ниже минимальной.' };
    }

    // Вес есть в форме только у дорогих товаров (тариф доставки от 10 000 ₸ зависит от веса)
    const weightRaw = formData.get('weightKg');
    let weightKg: number | null | undefined;
    if (weightRaw !== null) {
      const raw = String(weightRaw).replace(',', '.').trim();
      if (raw !== '' && !(Number(raw) > 0)) throw new Error('Вес — число килограммов, например 12.');
      weightKg = raw === '' ? null : Number(raw);
    }
    await api(`/products/${productId}`, { method: 'PATCH', body: { costPrice, preorderDays, ...(weightKg !== undefined && { weightKg }) } });
    if (floorPrice) {
      await api(`/products/${productId}/repricer`, {
        method: 'PUT',
        body: { enabled, floorPrice, ceilingPrice, step: step || 1 },
      });
    } else if (hasSetting) {
      return { error: 'Минимальную цену нельзя очистить: бот на этом товаре уже настроен.' };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось сохранить.' };
  }

  revalidatePath(`/shops/${shopId}/products`);
  return { ok: true };
}

/** Правка из таблицы: цена, остаток или наличие склада — сразу в Kaspi. */
export async function editOffer(
  shopId: string,
  productId: string,
  edit: { kind: 'price'; value: string } | { kind: 'stock'; storeId: string; value: string } | { kind: 'availability'; storeId: string; value: boolean },
): Promise<{ ok?: boolean; error?: string }> {
  let value: number | boolean | null;
  if (edit.kind === 'availability') value = edit.value;
  else {
    const raw = edit.value.replace(/\s/g, '');
    if (raw !== '' && !/^\d+$/.test(raw)) return { error: 'Введите целое число.' };
    if (raw === '' && edit.kind === 'price') return { error: 'Введите цену.' };
    value = raw === '' ? null : Number(raw);
  }
  try {
    await api(`/products/${productId}/edit`, {
      method: 'POST',
      body: { kind: edit.kind, value, ...('storeId' in edit ? { storeId: edit.storeId } : {}) },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось сохранить в Kaspi.' };
  }
  revalidatePath(`/shops/${shopId}/products`);
  return { ok: true };
}

export type BulkAction ='enable' | 'disable' | 'step' | 'floor' | 'ceiling' | 'preorder' | 'cost';

/** Массовое действие над выбранными товарами; возвращает итог для подсказки. */
export async function bulkUpdate(
  shopId: string,
  productIds: string[],
  action: BulkAction,
  rawValue: string,
): Promise<{ message?: string; error?: string }> {
  const raw = rawValue.replace(/\s/g, '');
  if (raw !== '' && !/^\d+$/.test(raw)) return { error: 'Введите целое число.' };
  const value = raw === '' ? null : Number(raw);
  try {
    const result = await api<{ updated: number; skipped: string[] }>(`/shops/${shopId}/products/bulk`, {
      method: 'POST',
      body: { productIds, action, value },
    });
    revalidatePath(`/shops/${shopId}/products`);
    const skipped = result.skipped.length
      ? ` Пропущено: ${result.skipped.length} — ${action === 'ceiling' ? 'нет мин. цены или макс. ниже мин.' : action === 'floor' ? 'мин. выше макс.' : 'не задана минимальная цена'}.`
      : '';
    return { message: `Готово: ${result.updated}.${skipped}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось применить.' };
  }
}

export interface SyncState {
  result?: { onSale: number; created: number; updated: number; removedFromSale: number; sellersChecked: number };
  error?: string;
}

export async function syncProducts(_prev: SyncState, formData: FormData): Promise<SyncState> {
  const shopId = String(formData.get('shopId'));
  try {
    const result = await api<NonNullable<SyncState['result']>>(`/shops/${shopId}/products/sync`, { method: 'POST' });
    revalidatePath(`/shops/${shopId}/products`);
    return { result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось синхронизировать товары.' };
  }
}
