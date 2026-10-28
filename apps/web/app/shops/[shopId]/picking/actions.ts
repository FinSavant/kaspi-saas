'use server';

import { api } from '@/lib/api';

export interface PickingMarkPatch {
  orderCode: string;
  sku: string;
  collected?: boolean;
  packed?: boolean;
}

/** Галочки сохраняются сразу; страницу не перезагружаем — состояние уже на экране. */
export async function saveMarks(shopId: string, marks: PickingMarkPatch[]): Promise<{ ok?: boolean; error?: string }> {
  try {
    await api(`/shops/${shopId}/picking/marks`, { method: 'PUT', body: { marks } });
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Не удалось сохранить.' };
  }
}
