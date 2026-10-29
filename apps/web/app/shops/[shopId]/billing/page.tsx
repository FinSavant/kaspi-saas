import Link from 'next/link';
import { HelpTip } from '@/components/HelpTip';
import { TIPS } from '@/lib/tips';
import { PlanCards, formatDate, money, whatsappLink, type Billing } from '@/components/Plans';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

function Usage({ label, used, max }: { label: string; used: number; max: number }) {
  const full = used >= max;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-slate-500">{label}</span>
        <span className={full ? 'font-semibold text-red-600' : 'font-medium'}>
          {used} из {max}
        </span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${full ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(100, (used / max) * 100)}%` }} />
      </div>
    </div>
  );
}

export default async function BillingPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const b = await api<Billing>(`/shops/${shopId}/billing`);
  const current = b.plans.find((p) => p.id === b.plan) ?? b.plans[0]!;

  const statusText = b.isAdmin
    ? 'Аккаунт владельца платформы — без ограничений'
    : b.status === 'trial'
      ? `Пробный период до ${formatDate(b.activeUntil!)}`
      : b.status === 'paid'
        ? `Оплачено до ${formatDate(b.activeUntil!)}`
        : 'Доступ закрыт: срок оплаты истёк. Данные сохранены, робот остановлен.';

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Тарифы</h1>
        <HelpTip {...TIPS.billing} />
        {b.isAdmin && (
          <Link href="/admin" className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Продавцы и подписки →
          </Link>
        )}
      </div>

      <section
        className={`rounded-xl border p-5 ${b.status === 'expired' && !b.isAdmin ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm text-slate-500">Ваш тариф</div>
            <div className="text-xl font-bold">
              {current.name} · {money(b.monthlyPrice)} в месяц
            </div>
            {b.reviewsAddon && !current.reviewsIncluded && <div className="text-sm text-slate-500">включая отзывы {money(b.reviewsAddonPrice)}</div>}
            <div className={`mt-1 text-sm ${b.status === 'expired' && !b.isAdmin ? 'font-medium text-red-700' : 'text-slate-600'}`}>{statusText}</div>
          </div>
          {/* У владельца платформы лимитов нет */}
          {!b.isAdmin && (
          <div className="w-full max-w-xs space-y-3">
            <Usage label="Магазины" used={b.usage.shops} max={current.maxShops} />
            {current.maxRobotProducts > 0 && <Usage label="Товары под роботом" used={b.usage.robotProducts} max={current.maxRobotProducts} />}
            {current.maxPreorderProducts > 0 && <Usage label="Товары на предзаказе" used={b.usage.preorderProducts} max={current.maxPreorderProducts} />}
          </div>
          )}
        </div>
      </section>

      {!b.whatsapp && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Номер WhatsApp для оплаты не задан (SANQ_WHATSAPP в .env) — кнопки оплаты неактивны.
        </p>
      )}

      <PlanCards b={b} />

      <p className="text-sm text-slate-500">
        Новый аккаунт получает {b.trialDays} дня бесплатно со всеми функциями. Оплата помесячно, переводом; после оплаты доступ продлевается
        вручную в течение дня.
      </p>
    </div>
  );
}
