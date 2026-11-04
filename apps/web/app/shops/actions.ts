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

export interface ChatLoginState {
  status?: 'SMS_SENT' | 'OK';
  sentTo?: string;
  chats?: number;
  error?: string;
}

/** Вход по телефону для чата: шаг 1 — номер (Kaspi шлёт SMS), шаг 2 — код. */
export async function chatLogin(prev: ChatLoginState, formData: FormData): Promise<ChatLoginState> {
  const shopId = String(formData.get('shopId'));
  try {
    if (prev.status === 'SMS_SENT' && formData.get('code')) {
      const result = await api<{ status: 'OK'; chats: number }>(`/shops/${shopId}/chat/code`, {
        method: 'POST',
        body: { code: String(formData.get('code')) },
      });
      revalidatePath(`/shops/${shopId}/settings`);
      return result;
    }
    return await api<{ status: 'SMS_SENT'; sentTo: string }>(`/shops/${shopId}/chat/login`, {
      method: 'POST',
      body: { phone: String(formData.get('phone') ?? '') },
    });
  } catch (error) {
    return { ...(prev.status === 'SMS_SENT' ? prev : {}), error: error instanceof Error ? error.message : 'Не удалось войти.' };
  }
}

export interface CabinetState {
  status?: 'OK' | 'MFA_REQUIRED' | 'SMS_SENT';
  email?: string;
  sentTo?: string;
  offers?: number;
  error?: string;
}

type CabinetResponse = { status: 'OK'; offers: number } | { status: 'MFA_REQUIRED'; email: string };

/** Вход в кабинет Kaspi и, если Kaspi прислал письмо, ввод кода — одна форма в два шага. */
export async function cabinetLogin(prev: CabinetState, formData: FormData): Promise<CabinetState> {
  const shopId = String(formData.get('shopId'));
  try {
    const code = String(formData.get('code') ?? '').trim();
    if (formData.get('method') === 'phone') {
      // Вход по номеру: шаг 1 — номер (Kaspi шлёт SMS), шаг 2 — код
      const result =
        prev.status === 'SMS_SENT' && code
          ? await api<CabinetResponse>(`/shops/${shopId}/cabinet/phone-code`, { method: 'POST', body: { code } })
          : await api<{ status: 'SMS_SENT'; sentTo: string }>(`/shops/${shopId}/cabinet/phone`, {
              method: 'POST',
              body: { phone: String(formData.get('phone') ?? '') },
            });
      revalidatePath(`/shops/${shopId}/settings`);
      return result;
    }
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
    return { ...(prev.status === 'MFA_REQUIRED' || prev.status === 'SMS_SENT' ? prev : {}), error: error instanceof Error ? error.message : 'Не удалось войти.' };
  }
}
