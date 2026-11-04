import type { Breakdowns, ProductRow, ReportTotals, SalesReport } from '@kaspi/core/analytics';
import { HelpTip } from '@/components/HelpTip';
import { TIPS } from '@/lib/tips';
import Link from 'next/link';
import { ShopTabs } from '@/components/ShopTabs';
import { AreaTrendChart, DonutChart, RevenueBarsChart } from '@/components/charts';
import { api } from '@/lib/api';
import { CommissionForm, ExpensesForm, FeesForm, SyncOrdersButton } from './forms';
import {
  arrangeProducts,
  Card,
  Delta,
  ExpenseTable,
  pct,
  PRODUCT_FILTERS,
  PRODUCT_SORTS,
  ProductTable,
  ProductToolbar,
  ShareTable,
  StatusBars,
  tenge,
  Tile,
} from './parts';

export const dynamic = 'force-dynamic';

interface AnalyticsResponse {
  period: string;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  ordersSyncedAt: string | null;
  syncing: boolean;
  ordersWithoutItems: number;
  current: SalesReport;
  previous: ReportTotals;
  breakdowns: Breakdowns;
  previousAvgProcessingHours: number | null;
  unrealized: {
    totals: ReportTotals;
    byProduct: ProductRow[];
    missing: SalesReport['missing'];
    stages: { stage: string; orders: number; revenue: number }[];
  };
  unitCosts: Record<string, number | null>;
  fees: { commissionVatPercent: number; paymentFeePercent: number; taxPercent: number };
  customExpenses: { name: string; percent: number }[];
  commissions: { category: string; title: string | null; percent: number | null }[];
}

const PRESETS = [
  { key: 'today', label: 'Сегодня' },
  { key: 'yesterday', label: 'Вчера' },
  { key: 'month', label: 'Тек. месяц' },
  { key: 'prevmonth', label: 'Пред. месяц' },
  { key: '7', label: '7 дн' },
  { key: '30', label: '30 дн' },
  { key: '90', label: '90 дн' },
  { key: '365', label: 'Год' },
];

const TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'revenue', label: 'Выручка' },
  { key: 'products', label: 'Товары' },
  { key: 'geography', label: 'География' },
  { key: 'delivery', label: 'Доставка и оплата' },
  { key: 'profit', label: 'Прибыль' },
  { key: 'unrealized', label: 'В пути' },
  { key: 'cancellations', label: 'Отмены' },
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'short', timeStyle: 'short' });
const almatyDate = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Almaty' });
const hours = (h: number | null) => (h === null ? '—' : `${h.toLocaleString('ru-RU')} ч`);

type Search = { period?: string; from?: string; to?: string; tab?: string; sort?: string; only?: string; compare?: string };

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<Search>;
}) {
  const { shopId } = await params;
  const search = await searchParams;
  const tab = TABS.some((t) => t.key === search.tab) ? search.tab! : 'overview';
  const custom = search.from && search.to;
  const query = new URLSearchParams(custom ? { from: search.from!, to: search.to! } : { period: search.period ?? '30' });
  const [data, shops] = await Promise.all([
    api<AnalyticsResponse>(`/shops/${shopId}/analytics?${query}`),
    api<{ id: string; name: string }[]>('/shops'),
  ]);
  const { totals, byProduct, byDay, missing } = data.current;
  const prev = data.previous;
  const b = data.breakdowns;
  const base = `/shops/${shopId}/analytics`;
  const compare = search.compare === '1';
  const periodOnly = custom ? `from=${search.from}&to=${search.to}` : `period=${data.period}`;
  const periodQuery = periodOnly + (compare ? '&compare=1' : '');
  // Сортировка и фильтр таблиц товаров — во вкладках «Товары» и «В пути»
  const sort = PRODUCT_SORTS.some((s) => s.key === search.sort) ? search.sort! : 'revenue';
  const only = PRODUCT_FILTERS.some((f) => f.key === search.only) ? search.only! : '';
  const productHref = (q: { sort: string; only: string }) =>
    `${base}?${periodQuery}&tab=${tab}&sort=${q.sort}${q.only ? `&only=${q.only}` : ''}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="bg-gradient-to-r from-slate-900 to-blue-700 bg-clip-text text-3xl font-bold tracking-tight text-transparent">Аналитика</h1>
            <HelpTip {...TIPS.analytics} />
          </div>
          {/* Период, вкладка, сортировка и фильтр сохраняются при переключении */}
          <ShopTabs
            shops={shops}
            shopId={shopId}
            section="analytics"
            query={`${periodQuery}&tab=${tab}&sort=${sort}${only ? `&only=${only}` : ''}`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SyncOrdersButton shopId={shopId} syncing={data.syncing} />
          <nav className="flex flex-wrap rounded-xl border border-slate-200 bg-white p-1 text-sm shadow-sm">
            {PRESETS.map((p) => (
              <Link
                key={p.key}
                href={`${base}?period=${p.key}&tab=${tab}${compare ? '&compare=1' : ''}`}
                className={`whitespace-nowrap rounded-md px-3 py-1 ${!custom && data.period === p.key ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {p.label}
              </Link>
            ))}
          </nav>
          <form action={base} className="flex flex-wrap items-center gap-1 text-sm">
            <input type="hidden" name="tab" value={tab} />
            {compare && <input type="hidden" name="compare" value="1" />}
            <input type="date" name="from" defaultValue={almatyDate(data.from)} className="rounded border border-slate-300 bg-white px-2 py-1" aria-label="С" />
            <span className="text-slate-400">—</span>
            <input type="date" name="to" defaultValue={almatyDate(data.to)} className="rounded border border-slate-300 bg-white px-2 py-1" aria-label="По" />
            <button type="submit" className="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100">
              Показать
            </button>
          </form>
        </div>
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        Заказы обновлены: {data.ordersSyncedAt ? formatDate(data.ordersSyncedAt) : 'ещё не загружались'}. Продажи — выданные
        заказы; заказы в работе — во вкладке «В пути».
      </p>

      {(missing.productsWithoutCost > 0 || missing.categoriesWithoutCommission.length > 0 || data.ordersWithoutItems > 0) && (
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {missing.productsWithoutCost > 0 && (
            <p>
              У {missing.productsWithoutCost} проданных товаров не указана себестоимость — прибыль завышена. Впишите её во вкладке{' '}
              <Link href={`${base}?${periodQuery}&tab=products`} className="underline">
                «Товары»
              </Link>
              .
            </p>
          )}
          {missing.categoriesWithoutCommission.length > 0 && (
            <p>
              Не задана комиссия Kaspi для {missing.categoriesWithoutCommission.length} категорий — заполните её во вкладке{' '}
              <Link href={`${base}?${periodQuery}&tab=profit`} className="underline">
                «Прибыль»
              </Link>
              .
            </p>
          )}
          {data.ordersWithoutItems > 0 && <p>У {data.ordersWithoutItems} заказов ещё не загружены товары — они не вошли в отчёт.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`${base}?${periodOnly}&tab=${tab}${compare ? '' : '&compare=1'}`}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${compare ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
        >
          {compare ? '✓ Сравнение с предыдущим периодом' : 'Сравнить с предыдущим периодом'}
        </Link>
        {compare && (
          <span className="text-xs text-slate-500">
            {almatyDate(data.from)} — {almatyDate(data.to)} против {almatyDate(data.previousFrom)} — {almatyDate(data.previousTo)}
          </span>
        )}
      </div>

      {compare && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2">Показатель</th>
                <th className="px-3 py-2 text-right">Этот период</th>
                <th className="px-3 py-2 text-right">Предыдущий</th>
                <th className="px-3 py-2 text-right">Разница</th>
                <th className="px-3 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Продано, шт (SKU)', totals.units, prev.units, false],
                  ['Заказы', totals.orders, prev.orders, false],
                  ['Выручка', totals.revenue, prev.revenue, true],
                  ['Средний чек', totals.avgCheck, prev.avgCheck, true],
                  ['Чистая прибыль', totals.netProfit, prev.netProfit, true],
                ] as [string, number, number, boolean][]
              ).map(([label, now, before, money]) => {
                const fmt = (v: number) => (money ? tenge(v) : v.toLocaleString('ru-RU'));
                const diff = now - before;
                return (
                  <tr key={label} className="border-t border-slate-100 even:bg-slate-50/60 hover:bg-blue-50/40">
                    <td className="px-3 py-2 font-medium">{label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(now)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmt(before)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                      {diff > 0 ? '+' : ''}
                      {fmt(diff)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Delta now={now} before={before} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Выручка" icon="money" accent="blue" value={tenge(totals.revenue)} delta={<Delta now={totals.revenue} before={prev.revenue} />} />
        <Tile label="Заказы" icon="orders" accent="violet" value={totals.orders.toLocaleString('ru-RU')} delta={<Delta now={totals.orders} before={prev.orders} />} />
        <Tile label="Средний чек" icon="check" accent="sky" value={tenge(totals.avgCheck)} delta={<Delta now={totals.avgCheck} before={prev.avgCheck} />} />
        <Tile
          label="Возвраты / Отмены"
          icon="cancel"
          accent="rose"
          value={pct(totals.cancelRatePercent)}
          delta={<Delta now={totals.cancelRatePercent} before={prev.cancelRatePercent} inverse />}
        />
        <Tile
          label="Ср. время до передачи курьеру"
          icon="clock"
          accent="amber"
          value={hours(b.avgProcessingHours)}
          delta={<Delta now={b.avgProcessingHours} before={data.previousAvgProcessingHours} inverse />}
        />
      </div>

      <Link
        href={`${base}?${periodQuery}&tab=unrealized`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm hover:border-sky-300"
      >
        <span className="font-medium text-sky-900">Ожидается к поступлению — заказы в пути</span>
        <span className="flex flex-wrap gap-x-6 gap-y-1 text-sky-900">
          <span>
            Сумма: <b className="tabular-nums">{tenge(data.unrealized.totals.revenue)}</b>
          </span>
          <span>
            Ожидаемая прибыль: <b className="tabular-nums">{tenge(data.unrealized.totals.netProfit)}</b>
          </span>
          <span>Заказов: {data.unrealized.totals.orders}</span>
        </span>
      </Link>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 text-sm shadow-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}?${periodQuery}&tab=${t.key}`}
            className={`whitespace-nowrap rounded-xl px-3.5 py-2 transition ${tab === t.key ? 'bg-gradient-to-r from-blue-600 to-sky-500 font-semibold text-white shadow' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Динамика выручки и прибыли">
              <AreaTrendChart
                xKey="date"
                data={byDay.map((d) => ({ date: `${d.date.slice(8, 10)}.${d.date.slice(5, 7)}`, revenue: d.revenue, netProfit: d.netProfit }))}
                series={[
                  { key: 'revenue', name: 'Выручка', color: '#2563eb' },
                  { key: 'netProfit', name: 'Чистая прибыль', color: '#10b981' },
                ]}
              />
            </Card>
          </div>
          <Card title="Заказы по статусам">
            <StatusBars rows={b.statuses} />
          </Card>
        </div>
      )}

      {tab === 'revenue' && (
        <Card
          title="Выручка по периодам"
          footer={`Группировка: ${{ day: 'по дням', week: 'по неделям (с понедельника)', month: 'по месяцам' }[b.revenueByPeriod.granularity]}.`}
        >
          <RevenueBarsChart xKey="label" data={b.revenueByPeriod.rows.map((r) => ({ label: r.label, revenue: r.revenue, orders: r.orders }))} />
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-xs tracking-wide text-slate-400 uppercase">
                {['Период', 'Заказы', 'Выручка', 'Ср. чек', 'Изменение'].map((h) => (
                  <th key={h} className="pb-2 pr-3 text-right font-medium first:text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...b.revenueByPeriod.rows].reverse().map((r) => (
                <tr key={r.start} className="border-t border-slate-100 even:bg-slate-50/60 hover:bg-blue-50/40">
                  <td className="py-2 pr-3">{r.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{r.orders}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{tenge(r.revenue)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{tenge(r.avgCheck)}</td>
                  <td className={`py-2 pr-3 text-right tabular-nums ${r.changePercent === null ? '' : r.changePercent >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {r.changePercent === null ? '—' : `${r.changePercent > 0 ? '+' : ''}${r.changePercent.toLocaleString('ru-RU')}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === 'products' && (
        <Card
          title="Товары по выручке"
          footer="ABC: «A» — товары, которые дают первые 80% выручки, «B» — следующие 15%, «C» — остальные. Себестоимость вводится прямо в таблице."
        >
          <ProductToolbar href={productHref} sort={sort} only={only} />
          <ProductTable rows={arrangeProducts(byProduct, sort, only)} shopId={shopId} unitCosts={data.unitCosts} />
        </Card>
      )}

      {tab === 'geography' && (
        <Card title="Топ-10 городов по выручке">
          <ShareTable rows={b.cities} nameTitle="Город" withAvgCheck />
        </Card>
      )}

      {tab === 'delivery' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Расходы на доставку" icon="truck" accent="rose" value={tenge(b.delivery.cost)} />
            <Tile label="% от выручки" icon="percent" accent="amber" value={pct(b.delivery.percentOfRevenue)} />
            <Tile label="Экспресс-заказы" icon="clock" accent="violet" value={b.delivery.expressOrders.toLocaleString('ru-RU')} />
            <Tile label="Kaspi Доставка" icon="truck" accent="sky" value={b.delivery.kaspiDeliveryOrders.toLocaleString('ru-RU')} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="По типу доставки">
              <ShareTable rows={b.deliveryModes} nameTitle="Тип" />
            </Card>
            <Card title="По типу оплаты">
              <ShareTable rows={b.paymentModes} nameTitle="Тип" />
            </Card>
            <Card title="Экспресс и обычные">
              <ShareTable rows={b.express} nameTitle="Тип" withAvgCheck />
            </Card>
            <Card title="Kaspi Доставка и своя">
              <ShareTable rows={b.kaspiDelivery} nameTitle="Тип" />
            </Card>
          </div>
        </div>
      )}

      {tab === 'profit' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Tile label="Чистая прибыль" icon="profit" value={tenge(totals.netProfit)} tone="good" delta={<Delta now={totals.netProfit} before={prev.netProfit} />} />
            <Tile label="Маржинальность" icon="percent" accent="violet" value={pct(totals.marginPercent)} />
            <Tile label="Покрытие себестоимостью" icon="box" accent="amber" value={pct(totals.costCoveragePercent)} />
          </div>
          <Card title="Структура прибыли">
            <DonutChart
              centerLabel="Выручка"
              centerValue={tenge(totals.revenue)}
              items={[
                { label: 'Себестоимость', value: totals.costOfGoods, color: '#f59e0b' },
                { label: 'Комиссия Kaspi', value: totals.commission, color: '#2563eb' },
                { label: 'НДС комиссии', value: totals.commissionVat, color: '#0ea5e9' },
                { label: 'Kaspi Pay', value: totals.paymentFee, color: '#7c3aed' },
                { label: 'Налог', value: totals.tax, color: '#94a3b8' },
                { label: 'Свои расходы', value: totals.expenses, color: '#ec4899' },
                { label: 'Доставка', value: totals.delivery, color: '#f43f5e' },
                { label: 'Чистая прибыль', value: Math.max(totals.netProfit, 0), color: '#10b981' },
              ]}
            />
          </Card>
          <Card
            title="Детализация расходов"
            footer="Комиссия — по категории товара, НДС — сверху на комиссию, Kaspi Pay и налог — от суммы продажи, доставка — фактическая сумма, удержанная Kaspi по каждому заказу."
          >
            <ExpenseTable totals={totals} previous={prev} fees={data.fees} />
          </Card>
          <Card title="Удержания Kaspi">
            <FeesForm shopId={shopId} commissionVatPercent={data.fees.commissionVatPercent} paymentFeePercent={data.fees.paymentFeePercent} taxPercent={data.fees.taxPercent} />
          </Card>
          <Card title="Свои расходы" footer="Реклама, упаковка, зарплата и другие расходы в процентах от выручки. Вычитаются из прибыли и учитываются в минимальной цене робота.">
            <ExpensesForm shopId={shopId} expenses={data.customExpenses} />
          </Card>
          <Card
            title="Комиссия Kaspi по категориям, без НДС"
            footer="Ставки из официальной таблицы «Тарифы Магазина на Kaspi.kz 2026». Если Kaspi поменяет ставку или у товара акция, исправьте её здесь."
          >
            {data.commissions.length === 0 ? (
              <p className="text-sm text-slate-500">Категории появятся после загрузки заказов.</p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {data.commissions.map((c) => (
                  <li key={c.category} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-sm">{c.title ?? c.category}</span>
                    <CommissionForm shopId={shopId} category={c.category} title={c.title} percent={c.percent} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'unrealized' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Заказы, которые ещё не выданы покупателю: новые, в упаковке, в доставке, ждут самовывоза. Деньги по ним
            поступят после выдачи. Блок не зависит от выбранного периода — это всё, что сейчас в работе.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Tile label="Ожидается выручки" value={tenge(data.unrealized.totals.revenue)} tone="info" />
            <Tile label="Ожидаемая чистая прибыль" value={tenge(data.unrealized.totals.netProfit)} tone="good" />
            <Tile label="Заказов в работе" value={data.unrealized.totals.orders.toLocaleString('ru-RU')} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="По этапам">
              {data.unrealized.stages.length === 0 ? (
                <p className="text-sm text-slate-500">Заказов в работе нет.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.unrealized.stages.map((s) => (
                      <tr key={s.stage} className="border-t border-slate-200 first:border-t-0">
                        <td className="py-2 pr-3">{s.stage}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{s.orders}</td>
                        <td className="py-2 text-right tabular-nums">{tenge(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <div className="lg:col-span-2">
              <Card title="Ожидаемые расходы и прибыль">
                <ExpenseTable totals={data.unrealized.totals} fees={data.fees} revenueLabel="Ожидаемая выручка" profitLabel="Ожидаемая прибыль" />
              </Card>
            </div>
          </div>
          <Card title="Товары в пути">
            <ProductToolbar href={productHref} sort={sort} only={only} />
            <ProductTable rows={arrangeProducts(data.unrealized.byProduct, sort, only)} shopId={shopId} unitCosts={data.unitCosts} />
          </Card>
        </div>
      )}

      {tab === 'cancellations' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Тренд отмен и возвратов">
              <AreaTrendChart
                xKey="date"
                unit=""
                data={b.cancellationsByDay.map((d) => ({ date: `${d.date.slice(8, 10)}.${d.date.slice(5, 7)}`, cancelled: d.cancelled, total: d.total }))}
                series={[
                  { key: 'total', name: 'Все заказы', color: '#94a3b8' },
                  { key: 'cancelled', name: 'Отмены и возвраты', color: '#f43f5e' },
                ]}
              />
            </Card>
          </div>
          <Card title="По статусам">
            {b.cancellationStatuses.length === 0 ? (
              <p className="text-sm text-slate-500">Отмен и возвратов за период нет.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className="pb-2 text-left font-medium">Статус</th>
                    <th className="pb-2 text-right font-medium">Кол-во</th>
                    <th className="pb-2 text-right font-medium">Доля</th>
                  </tr>
                </thead>
                <tbody>
                  {b.cancellationStatuses.map((s) => (
                    <tr key={s.status} className="border-t border-slate-200">
                      <td className="py-2">{s.label}</td>
                      <td className="py-2 text-right tabular-nums">{s.count}</td>
                      <td className="py-2 text-right tabular-nums">{pct(s.sharePercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
