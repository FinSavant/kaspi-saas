'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export interface FormState {
  ok?: boolean;
  error?: string;
}

const failed = (error: unknown) => ({ error: error instanceof Error ? error.message : 'Не удалось сохранить.' });

export async function saveWbToken(_prev: FormState, formData: FormData): Promise<FormState> {
  const shopId = String(formData.get('shopId'));
  try {
    await api(`/shops/${shopId}/wb/token`, { method: 'PUT', body: { token: String(formData.get('token') ?? '') } });
  } catch (error) {
    return failed(error);
  }
  revalidatePath(`/shops/${shopId}/wb`, 'layout');
  return { ok: true };
}

export async function syncWb(_prev: FormState, formData: FormData): Promise<FormState> {
  const shopId = String(formData.get('shopId'));
  try {
    await api(`/shops/${shopId}/wb/sync`, { method: 'POST' });
  } catch (error) {
    return failed(error);
  }
  return { ok: true };
}

export async function saveWbTax(_prev: FormState, formData: FormData): Promise<FormState> {
  const shopId = String(formData.get('shopId'));
  const raw = String(formData.get('taxPercent') ?? '').replace(',', '.').trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(raw)) return { error: 'Налог — число, например 4.' };
  try {
    await api(`/shops/${shopId}/wb/settings`, { method: 'PATCH', body: { taxPercent: Number(raw) } });
  } catch (error) {
    return failed(error);
  }
  revalidatePath(`/shops/${shopId}/wb`, 'layout');
  return { ok: true };
}

export async function saveWbCost(shopId: string, nmId: string, value: string): Promise<FormState> {
  const raw = value.replace(/\s/g, '').replace(',', '.');
  if (raw !== '' && !/^\d+(\.\d{1,2})?$/.test(raw)) return { error: 'Число, например 450' };
  try {
    await api(`/shops/${shopId}/wb/products/${nmId}/cost`, { method: 'PUT', body: { costPrice: raw === '' ? null : Number(raw) } });
  } catch (error) {
    return failed(error);
  }
  revalidatePath(`/shops/${shopId}/wb`, 'layout');
  return { ok: true };
}

export async function deleteWbReport(shopId: string, reportId: string): Promise<FormState> {
  try {
    await api(`/shops/${shopId}/wb/reports/${reportId}`, { method: 'DELETE' });
  } catch (error) {
    return failed(error);
  }
  revalidatePath(`/shops/${shopId}/wb`, 'layout');
  return { ok: true };
}
