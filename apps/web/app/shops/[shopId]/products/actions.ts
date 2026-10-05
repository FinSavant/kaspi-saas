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

    if (enabled && !floorPrice) return { error: 'Чтобы включить бота, укажите минимальную цену.' };
    if (floorPrice && ceilingPrice && ceilingPrice < floorPrice) {
      return { error: 'Максимальная цена не может быть ниже минимальной.' };
    }

    await api(`/products/${productId}`, { method: 'PATCH', body: { costPrice, preorderDays } });
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
