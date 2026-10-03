'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export interface FormState {
  ok?: boolean;
  error?: string;
}

function parseOptionalNumber(value: FormDataEntryValue | null, pattern: RegExp, message: string): number | null {
  const raw = String(value ?? '').replace(/\s/g, '').replace(',', '.');
  if (raw === '') return null;
  if (!pattern.test(raw)) throw new Error(message);
  return Number(raw);
}

export async function saveCost(_prev: FormState, formData: FormData): Promise<FormState> {
  const shopId = String(formData.get('shopId'));
  try {
    const costPrice = parseOptionalNumber(formData.get('costPrice'), /^\d+$/, 'Себестоимость — целое число в тенге.');
    await api(`/products/${String(formData.get('productId'))}`, { method: 'PATCH', body: { costPrice } });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось сохранить.' };
  }
  revalidatePath(`/shops/${shopId}/analytics`);
  return { ok: true };
}

export async function saveCommission(_prev: FormState, formData: FormData): Promise<FormState> {
  const shopId = String(formData.get('shopId'));
  const category = String(formData.get('category'));
  try {
    const percent = parseOptionalNumber(formData.get('percent'), /^\d{1,3}(\.\d{1,2})?$/, 'Комиссия — число, например 12 или 12.5.');
    if (percent !== null && percent > 100) throw new Error('Комиссия не может быть больше 100%.');
    await api(`/commissions/${encodeURIComponent(category)}`, {
      method: 'PUT',
      body: { percent, title: String(formData.get('title') ?? '') || null },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось сохранить.' };
  }
  revalidatePath(`/shops/${shopId}/analytics`);
  return { ok: true };
}

export async function saveFees(_prev: FormState, formData: FormData): Promise<FormState> {
  const shopId = String(formData.get('shopId'));
  try {
    const pattern = /^\d{1,3}(\.\d{1,2})?$/;
    const commissionVatPercent = parseOptionalNumber(formData.get('commissionVatPercent'), pattern, 'НДС — число, например 16.');
    const paymentFeePercent = parseOptionalNumber(formData.get('paymentFeePercent'), pattern, 'Kaspi Pay — число, например 0.95.');
    await api(`/shops/${shopId}/fees`, {
      method: 'PATCH',
      body: { commissionVatPercent: commissionVatPercent ?? 0, paymentFeePercent: paymentFeePercent ?? 0 },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось сохранить.' };
  }
  revalidatePath(`/shops/${shopId}/analytics`);
  return { ok: true };
}

export async function syncOrders(_prev: FormState, formData: FormData): Promise<FormState> {
  const shopId = String(formData.get('shopId'));
  try {
    await api(`/shops/${shopId}/orders/sync`, { method: 'POST' });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось запустить загрузку.' };
  }
  revalidatePath(`/shops/${shopId}/analytics`);
  return { ok: true };
}
