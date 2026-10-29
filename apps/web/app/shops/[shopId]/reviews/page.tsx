import Link from 'next/link';
import { HelpTip } from '@/components/HelpTip';
import { TIPS } from '@/lib/tips';
import { SearchBox } from '@/components/SearchBox';
import { api } from '@/lib/api';
import { MailingToggle, SettingsButton, TemplatesButton, type ReviewSettings } from './Controls';

export const dynamic = 'force-dynamic';

interface MessageInfo {
  status: string;
  at: string;
  error: string | null;
  repliedAt?: string | null;
}

interface ReviewRow {
  code: string;
  status: string;
  createdAtKaspi: string;
  completedAt: string | null;
  plannedDeliveryDate: string | null;
  customerName: string | null;
  totalPrice: number;
  stage: 'new' | 'requested' | 'replied' | 'failed';
  greeting: MessageInfo | null;
  review: MessageInfo | null;
}

// Фишки как в Okto; «Недовольные» нет — тональность ответов мы не оцениваем, показываем «Ответили»
const CHIPS = [
  { key: 'all', label: 'Все', dot: '' },
  { key: 'new', label: 'Новые', dot: 'bg-blue-500' },
  { key: 'requested', label: 'Запросили', dot: 'bg-emerald-500' },
  { key: 'replied', label: 'Ответили', dot: 'bg-violet-500' },
  { key: 'failed', label: 'Не доставлено', dot: 'bg-red-500' },
] as const;

const STAGE: Record<ReviewRow['stage'], { label: string; className: string }> = {
  new: { label: 'Новые', className: 'bg-blue-50 text-blue-700' },
  requested: { label: 'Запросили', className: 'bg-emerald-50 text-emerald-700' },
  replied: { label: 'Ответили', className: 'bg-violet-50 text-violet-700' },
  failed: { label: 'Не доставлено', className: 'bg-red-50 text-red-700' },
};

const MESSAGE_LABEL: Record<string, string> = {
  SENT: '✓ отправлено',
  SENDING: 'отправляется…',
  FAILED: '✗ ошибка',
  REJECTED: '✗ Kaspi не пропустил',
  NO_CHAT: '✗ нет чата',
};

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

function MessageCell({ m }: { m: MessageInfo | null }) {
  if (!m) return <span className="text-xs text-slate-400">—</span>;
  const ok = m.status === 'SENT';
  return (
    <span className={`text-xs whitespace-nowrap ${ok ? 'text-emerald-700' : 'text-red-600'}`} title={m.error ?? undefined}>
      {MESSAGE_LABEL[m.status] ?? m.status}
      {ok && <span className="ml-1 text-slate-400">{day(m.at)}</span>}
    </span>
  );
}

export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { shopId } = await params;
  const { filter = 'all', q = '' } = await searchParams;
  const query = new URLSearchParams({ filter, ...(q && { q }) });
  const [settings, list, billing] = await Promise.all([
    api<ReviewSettings>(`/shops/${shopId}/reviews/settings`),
    api<{ counts: Record<string, number>; rows: ReviewRow[] }>(`/shops/${shopId}/reviews?${query}`),
    api<{ reviewsAllowed: boolean; reviewsAddonPrice: number }>(`/shops/${shopId}/billing`),
  ]);
  const href = (f: string) => `/shops/${shopId}/reviews?filter=${f}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">💬 Отзывы</h1>
          <HelpTip {...TIPS.reviews} />
        </div>
        <div className="flex items-center gap-2">
          <MailingToggle shopId={shopId} settings={settings} />
          <SettingsButton shopId={shopId} settings={settings} />
          <TemplatesButton shopId={shopId} settings={settings} />
        </div>
      </div>

      {!billing.reviewsAllowed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            Отзывы не входят в ваш тариф: рассылка не работает. Они есть в тарифах «Старт», «Pro» и «Только отзывы».
          </span>
          <Link href={`/shops/${shopId}/billing`} className="rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700">
            Подключить отзывы
          </Link>
        </div>
      )}

      {!settings.chatConnected && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Чат с покупателями не подключён. Подключите его в «Настройках» → «Чат с покупателями (отзывы)».
        </p>
      )}

      <SearchBox placeholder="Номер заказа или имя" />

      <nav className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <Link
            key={c.key}
            href={href(c.key)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === c.key ? 'bg-cyan-300 text-slate-900' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            {c.dot && <span className={`h-2 w-2 rounded-full ${c.dot}`} />}
            {c.label}
            <span className="text-xs opacity-70">{list.counts[c.key] ?? 0}</span>
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {['ID заказа', 'Статус', 'Дата заказа', 'Дата доставки', 'Имя', 'Сумма', 'Приветствие', 'Просьба об отзыве'].map((h) => (
                <th key={h} className={`px-4 py-2.5 font-medium ${h === 'Сумма' ? 'text-right' : 'text-left'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  Нет заказов
                </td>
              </tr>
            ) : (
              list.rows.map((r) => (
                <tr key={r.code} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-semibold">{r.code}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE[r.stage].className}`}>{STAGE[r.stage].label}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 tabular-nums">{day(r.createdAtKaspi)}</td>
                  <td className="px-4 py-2.5 text-slate-600 tabular-nums">{day(r.completedAt ?? r.plannedDeliveryDate)}</td>
                  <td className="px-4 py-2.5">{r.customerName ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{r.totalPrice.toLocaleString('ru-RU')} ₸</td>
                  <td className="px-4 py-2.5">
                    <MessageCell m={r.greeting} />
                  </td>
                  <td className="px-4 py-2.5">
                    <MessageCell m={r.review} />
                    {r.review?.repliedAt && <div className="text-xs text-violet-700">ответил {day(r.review.repliedAt)}</div>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Сообщения уходят в чат заказа в приложении Kaspi от имени магазина: приветствие — после нового заказа, просьба об
        отзыве со ссылками на 5 звёзд — после выдачи. Только заказы, оформленные после включения рассылки, и только в
        рабочие часы.
      </p>
    </div>
  );
}
