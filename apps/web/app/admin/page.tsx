import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AdminTable, BackButton, type Row } from './AdminTable';

export const dynamic = 'force-dynamic';

/** Админка владельца SANQ: продавцы, их тарифы и ручное продление после оплаты в WhatsApp. */
export default async function AdminPage() {
  // Не владельцу платформы страница не существует
  const rows = await api<Row[]>('/admin/subscriptions').catch((error) => {
    if (error instanceof ApiError && error.status === 403) notFound();
    throw error;
  });
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-2xl font-bold tracking-tight">Продавцы и подписки</h1>
      </div>
      <p className="text-sm text-slate-500">
        После оплаты выберите тариф и нажмите «+1 месяц» — срок продлится от конца текущей оплаты (или от сегодня, если она истекла).
      </p>
      <AdminTable rows={rows} />
    </div>
  );
}
