'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';

export interface ShopFormState {
  error?: string;
}

export async function addShop(_prev: ShopFormState, formData: FormData): Promise<ShopFormState> {
  const field = (name: string) => String(formData.get(name) ?? '');
  let id: string;
  try {
    ({ id } = await api<{ id: string }>('/shops', {
      method: 'POST',
      body: {
        name: field('name'),
        merchantId: field('merchantId'),
        apiToken: field('apiToken'),
        mcLogin: field('mcLogin'),
        mcPassword: field('mcPassword'),
      },
    }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось добавить магазин.' };
  }
  revalidatePath('/', 'layout');
  // Сразу в настройки: там вход в кабинет Kaspi для товаров и демпинг-бота
  redirect(`/shops/${id}/settings?added=1`);
}

export async function sendReportNow(_prev: ShopFormState & { ok?: boolean }, formData: FormData): Promise<ShopFormState & { ok?: boolean }> {
  try {
    await api(`/shops/${String(formData.get('shopId'))}/telegram/report`, { method: 'POST' });
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось отправить отчёт.' };
  }
}

export interface CabinetState {
  status?: 'OK' | 'MFA_REQUIRED';
  email?: string;
  offers?: number;
  error?: string;
}

type CabinetResponse = { status: 'OK'; offers: number } | { status: 'MFA_REQUIRED'; email: string };

/** Вход в кабинет Kaspi и, если Kaspi прислал письмо, ввод кода — одна форма в два шага. */
export async function cabinetLogin(prev: CabinetState, formData: FormData): Promise<CabinetState> {
  const shopId = String(formData.get('shopId'));
  try {
    const code = String(formData.get('code') ?? '').trim();
    const result =
      prev.status === 'MFA_REQUIRED' && code
        ? await api<CabinetResponse>(`/shops/${shopId}/cabinet/code`, { method: 'POST', body: { code } })
        : await api<CabinetResponse>(`/shops/${shopId}/cabinet/login`, {
            method: 'POST',
            body: { login: String(formData.get('login') ?? ''), password: String(formData.get('password') ?? '') },
          });
    revalidatePath(`/shops/${shopId}/settings`);
    return result;
  } catch (error) {
    // Ошибка на шаге кода не сбрасывает его: можно ввести код ещё раз
    return { ...(prev.status === 'MFA_REQUIRED' ? prev : {}), error: error instanceof Error ? error.message : 'Не удалось войти.' };
  }
}
