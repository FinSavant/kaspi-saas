import type { Breakdowns, ProductRow, ReportTotals, SalesReport } from '@kaspi/core/analytics';
import Link from 'next/link';
import { ProfitStructureChart } from '@/components/ProfitStructureChart';
import { SimpleLineChart } from '@/components/SimpleLineChart';
import { api } from '@/lib/api';
import { CommissionForm, FeesForm, SyncOrdersButton } from './forms';
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
  fees: { commissionVatPercent: number; paymentFeePercent: number };
  commissions: { category: string; title: string | null; percent: number | null }[];
}

const PRESETS = [
  { key: 'today', label: 'Сегодня' },
  { key: 'yesterday', label: 'Вчера' },
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

type Search = { period?: string; from?: string; to?: string; tab?: string; sort?: string; only?: string };

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
  const data = await api<AnalyticsResponse>(`/shops/${shopId}/analytics?${query}`);
  const { totals, byProduct, byDay, missing } = data.current;
  const prev = data.previous;
  const b = data.breakdowns;
  const base = `/shops/${shopId}/analytics`;
  const periodQuery = custom ? `from=${search.from}&to=${search.to}` : `period=${data.period}`;
  // Сортировка и фильтр таблиц товаров — во вкладках «Товары» и «В пути»
  const sort = PRODUCT_SORTS.some((s) => s.key === search.sort) ? search.sort! : 'revenue';
  const only = PRODUCT_FILTERS.some((f) => f.key === search.only) ? search.only! : '';
  const productHref = (q: { sort: string; only: string }) =>
    `${base}?${periodQuery}&tab=${tab}&sort=${q.sort}${q.only ? `&only=${q.only}` : ''}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Аналитика</h1>
        <div className="flex flex-wrap items-center gap-2">
          <SyncOrdersButton shopId={shopId} syncing={data.syncing} />
          <nav className="flex flex-wrap rounded-lg border border-slate-200 bg-white p-1 text-sm">
            {PRESETS.map((p) => (
              <Link
                key={p.key}
                href={`${base}?period=${p.key}&tab=${tab}`}
                className={`whitespace-nowrap rounded-md px-3 py-1 ${!custom && data.period === p.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {p.label}
              </Link>
            ))}
          </nav>
          <form action={base} className="flex items-center gap-1 text-sm">
            <input type="hidden" name="tab" value={tab} />
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Выручка" value={tenge(totals.revenue)} delta={<Delta now={totals.revenue} before={prev.revenue} />} />
        <Tile label="Заказы" value={totals.orders.toLocaleString('ru-RU')} delta={<Delta now={totals.orders} before={prev.orders} />} />
        <Tile label="Средний чек" value={tenge(totals.avgCheck)} delta={<Delta now={totals.avgCheck} before={prev.avgCheck} />} />
        <Tile
          label="Возвраты / Отмены"
          value={pct(totals.cancelRatePercent)}
          delta={<Delta now={totals.cancelRatePercent} before={prev.cancelRatePercent} inverse />}
        />
        <Tile
          label="Ср. время до передачи курьеру"
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

      <nav className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}?${periodQuery}&tab=${t.key}`}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${tab === t.key ? 'bg-emerald-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Динамика выручки">
              <SimpleLineChart
                xKey="date"
                unit=" ₸"
                data={byDay.map((d) => ({ date: `${d.date.slice(8, 10)}.${d.date.slice(5, 7)}`, revenue: d.revenue, netProfit: d.netProfit }))}
                lines={[
                  { key: 'revenue', name: 'Выручка', color: '#2563eb' },
                  { key: 'netProfit', name: 'Чистая прибыль', color: '#059669' },
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
          <SimpleLineChart
            xKey="label"
            unit=" ₸"
            data={b.revenueByPeriod.rows.map((r) => ({ label: r.label, revenue: r.revenue }))}
            lines={[{ key: 'revenue', name: 'Выручка', color: '#2563eb' }]}
          />
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                {['Период', 'Заказы', 'Выручка', 'Ср. чек', 'Изменение'].map((h) => (
                  <th key={h} className="pb-2 pr-3 text-right font-medium first:text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...b.revenueByPeriod.rows].reverse().map((r) => (
                <tr key={r.start} className="border-t border-slate-200">
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
            <Tile label="Расходы на доставку" value={tenge(b.delivery.cost)} />
            <Tile label="% от выручки" value={pct(b.delivery.percentOfRevenue)} />
            <Tile label="Экспресс-заказы" value={b.delivery.expressOrders.toLocaleString('ru-RU')} />
            <Tile label="Kaspi Доставка" value={b.delivery.kaspiDeliveryOrders.toLocaleString('ru-RU')} />
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
            <Tile label="Чистая прибыль" value={tenge(totals.netProfit)} tone="good" delta={<Delta now={totals.netProfit} before={prev.netProfit} />} />
            <Tile label="Маржинальность" value={pct(totals.marginPercent)} />
            <Tile label="Покрытие себестоимостью" value={pct(totals.costCoveragePercent)} />
          </div>
          <Card title="Структура прибыли">
            <ProfitStructureChart
              data={[
                { label: 'Выручка', value: totals.revenue, kind: 'revenue' },
                { label: 'Себест-ть', value: -totals.costOfGoods, kind: 'expense' },
                { label: 'Комиссия', value: -totals.commission, kind: 'expense' },
                { label: 'НДС комиссии', value: -totals.commissionVat, kind: 'expense' },
                { label: 'Kaspi Pay', value: -totals.paymentFee, kind: 'expense' },
                { label: 'Доставка', value: -totals.delivery, kind: 'expense' },
                { label: 'Прибыль', value: totals.netProfit, kind: 'profit' },
              ]}
            />
          </Card>
          <Card
            title="Детализация расходов"
            footer="Комиссия — по категории товара, НДС — сверху на комиссию, Kaspi Pay — от суммы продажи, доставка — фактическая сумма, удержанная Kaspi по каждому заказу."
          >
            <ExpenseTable totals={totals} previous={prev} fees={data.fees} />
          </Card>
          <Card title="Удержания Kaspi">
            <FeesForm shopId={shopId} commissionVatPercent={data.fees.commissionVatPercent} paymentFeePercent={data.fees.paymentFeePercent} />
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
              <SimpleLineChart
                xKey="date"
                data={b.cancellationsByDay.map((d) => ({ date: `${d.date.slice(8, 10)}.${d.date.slice(5, 7)}`, cancelled: d.cancelled, total: d.total }))}
                lines={[
                  { key: 'total', name: 'Все заказы', color: '#94a3b8' },
                  { key: 'cancelled', name: 'Отмены и возвраты', color: '#dc2626' },
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
