'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api';

export interface ReviewSettingsPatch {
  reviewsEnabled?: boolean;
  reviewHoursFrom?: number;
  reviewHoursTo?: number;
  reviewDelayHours?: number;
  newOrderMessages?: boolean;
  reviewMessages?: boolean;
  newOrderTemplate?: string;
  reviewTemplate?: string;
}

export async function saveReviewSettings(shopId: string, patch: ReviewSettingsPatch): Promise<{ ok?: boolean; error?: string }> {
  try {
    await api(`/shops/${shopId}/reviews/settings`, { method: 'PATCH', body: patch });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось сохранить.' };
  }
  revalidatePath(`/shops/${shopId}/reviews`);
  return { ok: true };
}
