import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { saveSubscription } from './actions';

export const dynamic = 'force-dynamic';

interface Row {
  userId: string;
  name: string | null;
  login: string;
  shops: string[];
  isAdmin: boolean;
  plan: string;
  status: 'trial' | 'paid' | 'expired';
  activeUntil: string | null;
  reviewsAddon: boolean;
  monthlyPrice: number;
  usage: { shops: number; robotProducts: number };
}

const STATUS: Record<Row['status'], { text: string; cls: string }> = {
  trial: { text: 'Пробный', cls: 'bg-blue-50 text-blue-700' },
  paid: { text: 'Оплачен', cls: 'bg-emerald-50 text-emerald-700' },
  expired: { text: 'Закрыт', cls: 'bg-red-50 text-red-700' },
};
const dateInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Almaty' }) : '');

/** Админка владельца SANQ: продавцы, их тарифы и ручное продление после оплаты в WhatsApp. */
export default async function AdminPage() {
  // Не владельцу платформы страница не существует
  const rows = await api<Row[]>('/admin/subscriptions').catch((error) => {
    if (error instanceof ApiError && error.status === 403) notFound();
    throw error;
  });
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Продавцы и подписки</h1>
      <p className="text-sm text-slate-500">
        После оплаты выберите тариф и нажмите «+1 мес» — срок продлится от конца текущей оплаты (или от сегодня, если она истекла).
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-3 py-2">Продавец</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2">Использование</th>
              <th className="px-3 py-2">Тариф и оплата</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-t border-slate-200 align-top">
                <td className="px-3 py-3">
                  <div className="font-medium">{r.name ?? r.login}</div>
                  <div className="text-xs text-slate-500">{r.shops.join(', ') || 'нет магазинов'}</div>
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[r.status].cls}`}>
                    {r.isAdmin ? 'Владелец' : STATUS[r.status].text}
                  </span>
                  {!r.isAdmin && r.activeUntil && <div className="mt-1 text-xs text-slate-500">до {dateInput(r.activeUntil)}</div>}
                </td>
                <td className="px-3 py-3 text-xs text-slate-600">
                  магазинов {r.usage.shops}, под роботом {r.usage.robotProducts}
                </td>
                <td className="px-3 py-3">
                  <form action={saveSubscription} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="userId" value={r.userId} />
                    <select name="plan" defaultValue={r.plan} className="rounded border border-slate-300 px-2 py-1">
                      <option value="start">Старт</option>
                      <option value="pro">Pro</option>
                      <option value="reviews">Только отзывы</option>
                      <option value="analytics">Только аналитика</option>
                    </select>
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" name="reviewsAddon" defaultChecked={r.reviewsAddon} /> отзывы
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      оплачено до
                      <input type="date" name="paidUntil" defaultValue={r.status === 'paid' ? dateInput(r.activeUntil) : ''} className="rounded border border-slate-300 px-1 py-0.5" />
                    </label>
                    <button className="rounded bg-slate-800 px-2 py-1 text-xs text-white">Сохранить</button>
                    <button name="addMonths" value="1" className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">+1 мес</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
