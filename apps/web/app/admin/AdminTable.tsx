'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { deleteAccount, saveSubscription } from './actions';

export interface Row {
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
  trial: { text: 'Пробный', cls: 'bg-blue-100 text-blue-800' },
  paid: { text: 'Оплачен', cls: 'bg-emerald-100 text-emerald-800' },
  expired: { text: 'Закрыт', cls: 'bg-red-100 text-red-800' },
};
const FILTERS: { key: 'all' | Row['status']; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'trial', label: 'Пробные' },
  { key: 'paid', label: 'Оплаченные' },
  { key: 'expired', label: 'Закрытые' },
];
const dateInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Almaty' }) : '');

/** Кнопка «Назад»: на предыдущую страницу, а если её нет — на главную. */
export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      ← Назад
    </button>
  );
}

export function AdminTable({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | Row['status']>('all');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && (r.isAdmin || r.status !== filter)) return false;
      if (!q) return true;
      return [r.name ?? '', r.login, ...r.shops].some((s) => s.toLowerCase().includes(q));
    });
  }, [rows, query, filter]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск: имя, email или магазин"
          className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f.key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">Показано {shown.length} из {rows.length}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">Продавец</th>
              <th className="px-4 py-3">Статус подписки</th>
              <th className="px-4 py-3">Использование</th>
              <th className="px-4 py-3">Тариф и оплата</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">Никого не найдено</td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.userId} className="align-top hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="font-medium">{r.name ?? r.login}</div>
                  {r.name && <div className="text-xs text-slate-500">{r.login}</div>}
                  <div className="text-xs text-slate-500">{r.shops.join(', ') || 'нет магазинов'}</div>
                  {!r.isAdmin && r.shops.length === 0 && (
                    <form action={deleteAccount} className="mt-1">
                      <input type="hidden" name="userId" value={r.userId} />
                      <button className="text-xs text-red-600 hover:underline">Удалить пустой аккаунт</button>
                    </form>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.isAdmin ? 'bg-violet-100 text-violet-800' : STATUS[r.status].cls}`}>
                    {r.isAdmin ? 'Владелец' : STATUS[r.status].text}
                  </span>
                  {!r.isAdmin && r.activeUntil && <div className="mt-1 text-xs text-slate-500">до {dateInput(r.activeUntil)}</div>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  <div>Магазинов: <b>{r.usage.shops}</b></div>
                  <div>Под роботом: <b>{r.usage.robotProducts}</b></div>
                </td>
                <td className="px-4 py-3">
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
                    <button className="rounded bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700">Сохранить</button>
                    <button name="addMonths" value="1" className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700">+1 месяц</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
