'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

/** Удаляет пустой аккаунт, созданный по ошибке (api не даст удалить аккаунт с магазинами). */
export async function deleteAccount(formData: FormData): Promise<void> {
  await api(`/admin/users/${String(formData.get('userId'))}`, { method: 'DELETE' });
  revalidatePath('/admin');
}

/** Сохраняет тариф продавца после оплаты: смена тарифа, отзывы, продление на N месяцев или точная дата. */
export async function saveSubscription(formData: FormData): Promise<void> {
  const userId = String(formData.get('userId'));
  const addMonths = Number(formData.get('addMonths') ?? 0);
  const paidUntil = String(formData.get('paidUntil') ?? '');
  await api(`/admin/subscriptions/${userId}`, {
    method: 'PUT',
    body: {
      plan: String(formData.get('plan')),
      reviewsAddon: formData.get('reviewsAddon') === 'on',
      ...(addMonths > 0 ? { addMonths } : paidUntil ? { paidUntil: `${paidUntil}T23:59:59+05:00` } : {}),
    },
  });
  revalidatePath('/admin');
}
