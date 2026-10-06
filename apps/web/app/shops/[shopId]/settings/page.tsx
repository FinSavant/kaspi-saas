import Link from 'next/link';
import { api } from '@/lib/api';
import { FeesForm } from '../analytics/forms';
import { CabinetLoginForm, ChatLoginForm, ReportNowButton } from '../../ShopForms';

export const dynamic = 'force-dynamic';

interface ShopSettings {
  name: string;
  merchantId: string;
  cityId: string;
  hasApiToken: boolean;
  hasCabinetSession: boolean;
  hasCabinetLogin: boolean;
  hasChatSession: boolean;
  chatPhone: string | null;
  productsSyncedAt: string | null;
  ordersSyncedAt: string | null;
  repricerEnabled: boolean;
  fees: { commissionVatPercent: number; paymentFeePercent: number };
}

const CITIES: Record<string, string> = { '750000000': 'Алматы', '710000000': 'Астана', '620000000': 'Шымкент' };
const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'short', timeStyle: 'short' }) : 'ещё не было';

function Status({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
      {ok ? okText : badText}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-3 first:border-t-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const { shopId } = await params;
  const { added } = await searchParams;
  const [s, shops, telegram] = await Promise.all([
    api<ShopSettings>(`/shops/${shopId}/settings`),
    api<{ id: string; name: string; merchantId: string }[]>('/shops'),
    api<{ configured: boolean; linked: boolean; url: string | null }>(`/shops/${shopId}/telegram`),
  ]);

  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Настройки</h1>

      {added && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Магазин подключён. Заказы за год загружаются (несколько минут). Для товаров и робота войдите в кабинет
          Kaspi ниже.
        </p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Магазины</h2>
          <Link href="/shops/new" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
            + Добавить магазин
          </Link>
        </div>
        {shops.map((shop) => (
          <Row key={shop.id} label={`ID ${shop.merchantId}`}>
            {shop.id === shopId ? (
              <span className="font-medium">{shop.name} · текущий</span>
            ) : (
              <Link href={`/shops/${shop.id}/settings`} className="underline">
                {shop.name}
              </Link>
            )}
          </Row>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Магазин</h2>
        <Row label="Название">{s.name}</Row>
        <Row label="ID продавца Kaspi">{s.merchantId}</Row>
        <Row label="Город для цен и конкурентов">{CITIES[s.cityId] ?? s.cityId}</Row>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Подключения к Kaspi</h2>
        <Row label="API-токен (заказы, накладные, аналитика)">
          <Status ok={s.hasApiToken} okText="Подключён" badText="Не подключён" />
        </Row>
        <Row label="Кабинет продавца (товары, робот)">
          <Status ok={s.hasCabinetSession} okText="Вход выполнен" badText="Нужен вход" />
        </Row>
        <Row label="Товары синхронизированы">{formatDate(s.productsSyncedAt)}</Row>
        <Row label="Заказы загружены">{formatDate(s.ordersSyncedAt)}</Row>
        <Row label="Робот">
          <Status ok={s.repricerEnabled} okText="Работает" badText="На паузе" />
        </Row>
        <p className="mt-2 text-xs text-slate-500">
          Токен и пароль кабинета хранятся в базе в зашифрованном виде; в кабинете они не показываются.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">Вход в кабинет Kaspi</h2>
        <p className="mb-3 text-sm text-slate-600">
          Нужен для синхронизации товаров и робота. Используйте отдельного пользователя кабинета с правом «Загрузка
          товаров». Если Kaspi пришлёт код на почту, здесь появится поле для него.
        </p>
        <CabinetLoginForm shopId={shopId} hasSavedLogin={s.hasCabinetLogin} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Удержания Kaspi для расчёта прибыли</h2>
        <FeesForm shopId={shopId} commissionVatPercent={s.fees.commissionVatPercent} paymentFeePercent={s.fees.paymentFeePercent} />
        <p className="mt-3 text-xs text-slate-500">Ставки комиссии по категориям — в «Аналитика» → «Прибыль».</p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Чат с покупателями (отзывы)</h2>
        <p className="text-sm text-slate-600">
          Kaspi открывает чат только входу по номеру телефона. Добавьте в кабинете Kaspi («Управление пользователями»)
          отдельный номер с правами на заказы и войдите им здесь — код придёт в SMS.
        </p>
        {s.hasChatSession && (
          <Row label="Подключён номер">
            <Status ok okText={s.chatPhone ?? 'подключён'} badText="" />
          </Row>
        )}
        <ChatLoginForm shopId={shopId} />
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">Telegram</h2>
        <p className="text-sm text-slate-600">
          Каждый день в 09:10 — отчёт за вчера по всем магазинам: заказы, выдачи, сколько поступит на счёт, робот
          (первые по цене и упёршиеся в минимальную цену) и товары с остатком 3 шт и меньше.
        </p>
        {!telegram.configured ? (
          <p className="text-sm text-amber-800">Бот ещё не создан: нужен токен от @BotFather на сервере.</p>
        ) : telegram.linked ? (
          <>
            <Row label="Telegram">
              <Status ok okText="Подключён" badText="" />
            </Row>
            <ReportNowButton shopId={shopId} />
            <a href={telegram.url!} target="_blank" rel="noreferrer" className="block text-xs text-slate-500 underline">
              Подключить другой чат
            </a>
          </>
        ) : (
          <a
            href={telegram.url!}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Подключить Telegram
          </a>
        )}
      </section>
    </div>
  );
}
