import type { ReportTotals } from '@kaspi/core/analytics';
import Link from 'next/link';
import { HelpTip } from '@/components/HelpTip';
import { formatDate, type Billing } from '@/components/Plans';
import { api } from '@/lib/api';
import { TIPS } from '@/lib/tips';

export const dynamic = 'force-dynamic';

interface Analytics {
  current: { totals: ReportTotals };
  previous: ReportTotals;
  unrealized: { totals: ReportTotals };
  ordersSyncedAt: string | null;
}

interface ProductLite {
  price: number;
  position: number | null;
  costPrice: number | null;
  repricerSetting: { enabled: boolean; floorPrice: number } | null;
}

const tenge = (n: number) => `${n.toLocaleString('ru-RU')} ₸`;

function Tile({ label, value, hint, href }: { label: string; value: string; hint?: string; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-400">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </Link>
  );
}

function change(now: number, before: number): string | undefined {
  if (!before) return undefined;
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}% к прошлой неделе`;
}

/** Главная: главное за неделю, состояние робота и тарифа, быстрые переходы. */
export default async function HomePage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const billing = await api<Billing>(`/shops/${shopId}/billing`);
  // Главная показывает только то, что входит в тариф
  const has = (f: Billing['features'][number]) => billing.features.includes(f);
  const [a, products] = await Promise.all([
    has('analytics') ? api<Analytics>(`/shops/${shopId}/analytics?period=7`) : null,
    has('robot') || has('products') ? api<ProductLite[]>(`/shops/${shopId}/products`) : ([] as ProductLite[]),
  ]);
  const t = a?.current.totals;
  const bot = products.filter((p) => p.repricerSetting?.enabled);
  const base = `/shops/${shopId}`;
  const noCost = products.filter((p) => p.costPrice === null).length;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">🏠 Главная</h1>
        <HelpTip {...TIPS.home} />
      </div>

      {a && t && (
      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">Последние 7 дней (выданные заказы)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Выручка" value={tenge(t.revenue)} hint={change(t.revenue, a.previous.revenue)} href={`${base}/analytics?period=7`} />
          <Tile label="Чистая прибыль" value={tenge(t.netProfit)} hint={change(t.netProfit, a.previous.netProfit)} href={`${base}/analytics?period=7&tab=profit`} />
          <Tile label="Заказов" value={String(t.orders)} hint={t.avgCheck ? `средний чек ${tenge(t.avgCheck)}` : undefined} href={`${base}/analytics?period=7`} />
          <Tile label="В пути" value={tenge(a.unrealized.totals.revenue)} hint={`${a.unrealized.totals.orders} заказов ещё не выданы`} href={`${base}/analytics?tab=unrealized`} />
        </div>
      </section>
      )}

      {has('robot') && (
      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">Робот цен</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile label="Робот включён" value={`${bot.length} из ${products.length}`} href={`${base}/robot`} />
          <Tile label="На 1-м месте" value={String(bot.filter((p) => p.position === 1).length)} hint="из товаров под роботом" href={`${base}/robot`} />
          <Tile
            label="Упёрлись в мин. цену"
            value={String(bot.filter((p) => p.price <= p.repricerSetting!.floorPrice).length)}
            hint="ниже робот не опустит"
            href={`${base}/robot`}
          />
        </div>
      </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        {has('waybills') && (
          <Link href={`${base}/waybills`} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-400">
            <div className="font-semibold">🧾 Накладные</div>
            <p className="mt-1 text-sm text-slate-500">Склеить накладные заказов из «Передачи» одним файлом.</p>
          </Link>
        )}
        {has('reviews') && (
          <Link href={`${base}/reviews`} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-400">
            <div className="font-semibold">💬 Отзывы</div>
            <p className="mt-1 text-sm text-slate-500">Рассылка покупателям: поздравление с заказом и просьба об отзыве.</p>
          </Link>
        )}
        <Link href={`${base}/billing`} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-400">
          <div className="font-semibold">💳 Тариф</div>
          <p className="mt-1 text-sm text-slate-500">
            {billing.isAdmin
              ? 'Аккаунт владельца — без ограничений.'
              : billing.status === 'trial'
                ? `Пробный период до ${formatDate(billing.activeUntil!)}.`
                : `Оплачено до ${formatDate(billing.activeUntil!)}.`}
          </p>
        </Link>
      </section>

      {has('products') && noCost > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          У {noCost} товаров не указана себестоимость — прибыль и мин. цена по ним не считаются.{' '}
          <Link href={`${base}/robot`} className="font-medium underline">
            Заполнить в «Робот цен»
          </Link>
        </p>
      )}
    </div>
  );
}
