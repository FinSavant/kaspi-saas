import type { WbProductRow, WbTotals } from '@kaspi/core/analytics';
import Link from 'next/link';
import { WbDailyChart, WbExpenseDonut, WbWaterfall } from '@/components/WbCharts';
import { api } from '@/lib/api';
import { CostInput } from '../../forms';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

interface ReportData {
  reports: { reportId: string; dateFrom: string | null; dateTo: string | null; source: string }[];
  dateFrom: string | null;
  dateTo: string | null;
  taxPercent: number;
  totals: WbTotals;
  byProduct: WbProductRow[];
  byDay: { date: string; units: number; revenue: number }[];
  byWarehouse: { warehouse: string; delivery: number; deliveries: number; units: number }[];
  bySaleMethod: { method: string; deliveries: number; delivery: number }[];
}

const tenge = (v: number | null) => (v === null ? '—' : `${Math.round(v).toLocaleString('ru-RU')} ₸`);
const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`);
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : '—');

function Kpi({ label, value, sub, tone = 'plain' }: { label: string; value: string; sub?: string; tone?: 'plain' | 'violet' | 'good' | 'bad' }) {
  const tones = {
    plain: 'bg-white ring-1 ring-slate-200',
    violet: 'bg-violet-50 ring-1 ring-violet-200',
    good: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md',
    bad: 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-md',
  };
  const strong = tone === 'good' || tone === 'bad';
  return (
    <div className={`rounded-2xl p-4 ${tones[tone]}`}>
      <div className={`text-xs font-medium ${strong ? 'text-white/80' : 'text-slate-500'}`}>{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className={`mt-0.5 text-xs ${strong ? 'text-white/80' : 'text-slate-500'}`}>{sub}</div>}
    </div>
  );
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-2xl bg-white p-5 ring-1 ring-slate-200 break-inside-avoid ${className}`}>
      <h2 className="mb-4 font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

function ProductMini({ p, kind }: { p: WbProductRow; kind: 'top' | 'loss' }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${kind === 'top' ? 'bg-emerald-100' : 'bg-rose-100'}`}>
        {kind === 'top' ? '▲' : '▼'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{p.title ?? `WB ${p.nmId}`}</div>
        <div className="text-xs text-slate-400">
          {p.units} шт · маржа {pct(p.marginPercent)}
          {p.netProfit !== null && p.units > 0 && ` · ${tenge(p.netProfit / p.units)} за шт`}
        </div>
      </div>
      <span className={`text-sm font-bold tabular-nums ${(p.netProfit ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{tenge(p.netProfit)}</span>
    </li>
  );
}

export default async function WbReportView({ params, searchParams }: { params: Promise<{ shopId: string }>; searchParams: Promise<{ ids?: string; per?: string }> }) {
  const { shopId } = await params;
  const { ids = '', per } = await searchParams;
  const perUnit = per === 'unit';
  // В режиме «за 1 шт» суммы товара делятся на проданные штуки за вычетом возвратов
  const by = (p: WbProductRow, v: number | null) => (v === null || !perUnit ? v : p.units > 0 ? v / p.units : null);
  const data = await api<ReportData>(`/shops/${shopId}/wb/report?ids=${encodeURIComponent(ids)}`);
  const t = data.totals;
  const summary = data.reports.length > 1;
  const roi = t.costOfGoods > 0 ? (t.netProfit / t.costOfGoods) * 100 : null;
  const withProfit = data.byProduct.filter((p) => p.netProfit !== null);
  const top = [...withProfit].sort((a, b) => b.netProfit! - a.netProfit!).slice(0, 5);
  const losses = withProfit.filter((p) => p.hasSales && p.netProfit! < 0).sort((a, b) => a.netProfit! - b.netProfit!).slice(0, 5);
  const sold = data.byProduct.filter((p) => p.hasSales);
  const notSold = data.byProduct.filter((p) => !p.hasSales).sort((a, b) => a.payout - b.payout);
  const noCost = sold.filter((p) => p.costPrice === null);
  const extraCharges = t.noSalesCharges + t.generalCharges;

  const steps = [
    { label: 'Реализовано', value: t.revenue, total: true },
    { label: 'Вознагр. WB', value: -t.commission },
    { label: 'Логистика', value: -t.delivery },
    { label: 'Хранение', value: -t.storage },
    { label: 'Приёмка', value: -t.acceptance },
    { label: 'Штрафы и удерж.', value: -(t.penalty + t.deduction) + t.additionalPayment },
    { label: 'К оплате', value: t.payout, total: true },
    { label: 'Себестоимость', value: -t.costOfGoods },
    { label: 'Налог', value: -t.tax },
    { label: 'Прибыль', value: t.netProfit, total: true },
  ].filter((s) => s.total || s.value !== 0);

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-fuchsia-600 to-pink-500 p-6 text-white shadow-lg print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={`/shops/${shopId}/wb/reports`} className="text-sm text-white/80 hover:text-white print:hidden">
              ← Все отчёты
            </Link>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">{summary ? `Сводный отчёт · ${data.reports.length} нед.` : `Отчёт №${data.reports[0]?.reportId ?? ''}`}</h1>
            <p className="mt-1 text-white/85">
              {date(data.dateFrom)} — {date(data.dateTo)}
            </p>
            {summary && <p className="mt-1 text-xs text-white/70">Отчёты: {data.reports.map((r) => `№${r.reportId}`).join(', ')}</p>}
          </div>
          <PrintButton />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Реализовано" value={tenge(t.revenue)} sub={`${t.units} шт продано`} tone="violet" />
        <Kpi label="Возвраты" value={`${t.returns} шт`} sub={t.units + t.returns ? `${pct((t.returns / (t.units + t.returns)) * 100)} от продаж` : undefined} />
        <Kpi label="К оплате от WB" value={tenge(t.payout)} sub={t.revenue ? `${pct((t.payout / t.revenue) * 100)} от реализованного` : undefined} />
        <Kpi label="Себестоимость" value={tenge(t.costOfGoods)} sub={t.costCoveragePercent !== null && t.costCoveragePercent < 100 ? `указана для ${pct(t.costCoveragePercent)}` : 'указана для всех'} />
        <Kpi label="Чистая прибыль" value={tenge(t.netProfit)} sub={`маржа ${pct(t.marginPercent)}`} tone={t.netProfit >= 0 ? 'good' : 'bad'} />
        <Kpi label="ROI" value={pct(roi)} sub="прибыль к себестоимости" />
      </div>

      {extraCharges > 0 && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200 break-inside-avoid">
          <h2 className="font-semibold text-slate-800">Из чего сложилась прибыль</h2>
          <p className="mt-1 text-sm text-slate-500">Продажи считаются отдельно от удержаний WB по товарам, которые в этом отчёте не продавались.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Прибыль от продаж" value={tenge(t.salesProfit)} sub={`${sold.length} товаров с продажами · к оплате ${tenge(t.salesPayout)}`} tone={t.salesProfit >= 0 ? 'good' : 'bad'} />
            <Kpi label="Расходы по товарам без продаж" value={tenge(-t.noSalesCharges)} sub={`${notSold.length} товаров: логистика возвратов, отмен, приёмка, штрафы`} />
            <Kpi label="Общие расходы склада" value={tenge(-t.generalCharges)} sub="хранение и перевозка без артикула" />
            <Kpi label="Итого чистая прибыль" value={tenge(t.netProfit)} sub="продажи − все удержания" tone="violet" />
          </div>
        </section>
      )}

      {noCost.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 print:hidden">
          ⚠️ У {noCost.length} товаров нет себестоимости — прибыль по ним завышена.
          <Link href={`/shops/${shopId}/wb/products?only=nocost`} className="font-semibold underline">
            Указать в «Товарах WB»
          </Link>
          или прямо в таблице ниже.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Куда ушли деньги" className="xl:col-span-2">
          <WbWaterfall steps={steps} />
        </Card>
        <Card title="Удержания WB">
          <WbExpenseDonut
            items={[
              { label: 'Вознаграждение WB', value: t.commission },
              { label: 'Логистика', value: t.delivery },
              { label: 'Хранение', value: t.storage },
              { label: 'Платная приёмка', value: t.acceptance },
              { label: 'Штрафы', value: t.penalty },
              { label: 'Прочие удержания', value: t.deduction },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Продажи по дням" className="xl:col-span-2">
          {data.byDay.length ? <WbDailyChart data={data.byDay} /> : <p className="text-sm text-slate-500">Нет продаж.</p>}
        </Card>
        <Card title="Доставки по схеме">
          <div className="space-y-4">
            {data.bySaleMethod.length === 0 && <p className="text-sm text-slate-500">Нет данных о схеме доставки.</p>}
            {data.bySaleMethod.map((m) => {
              const share = t.delivery ? (m.delivery / t.delivery) * 100 : 0;
              return (
                <div key={m.method}>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{m.method}</span>
                    <span className="tabular-nums">
                      {m.deliveries} доставок · {tenge(m.delivery)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">в среднем {m.deliveries ? tenge(m.delivery / m.deliveries) : '—'} за доставку</div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-violet-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500" style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="🏆 Самые прибыльные">
          {top.length ? <ul className="divide-y divide-slate-100">{top.map((p) => <ProductMini key={p.nmId} p={p} kind="top" />)}</ul> : <p className="text-sm text-slate-500">Укажите себестоимость, чтобы увидеть прибыль по товарам.</p>}
        </Card>
        <Card title="📉 Убыточные">
          {losses.length ? <ul className="divide-y divide-slate-100">{losses.map((p) => <ProductMini key={p.nmId} p={p} kind="loss" />)}</ul> : <p className="text-sm text-slate-500">Убыточных товаров нет 👍</p>}
        </Card>
      </div>

      <Card title="Логистика по складам">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-2 font-medium">Склад</th>
                <th className="pb-2 text-right font-medium">Продано</th>
                <th className="pb-2 text-right font-medium">Доставок</th>
                <th className="pb-2 text-right font-medium">Логистика</th>
                <th className="pb-2 text-right font-medium">На 1 доставку</th>
              </tr>
            </thead>
            <tbody>
              {data.byWarehouse.map((w) => (
                <tr key={w.warehouse} className="border-t border-slate-100">
                  <td className="py-2">{w.warehouse}</td>
                  <td className="py-2 text-right tabular-nums">{w.units}</td>
                  <td className="py-2 text-right tabular-nums">{w.deliveries}</td>
                  <td className="py-2 text-right font-medium text-rose-700 tabular-nums">{tenge(w.delivery)}</td>
                  <td className="py-2 text-right text-slate-500 tabular-nums">{w.deliveries ? tenge(w.delivery / w.deliveries) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {notSold.length > 0 && (
        <Card title={`Удержания без продаж · ${notSold.length} товаров · ${tenge(-t.noSalesCharges)}`}>
          <p className="-mt-2 mb-3 text-sm text-slate-500">
            WB удержал деньги по товарам, которые в этом отчёте не продавались: обратная логистика возвратов и отмен, доставка на склад, приёмка и штрафы.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-right text-xs text-slate-500">
                <tr>
                  <th className="pb-2 text-left font-medium">Товар</th>
                  <th className="pb-2 font-medium">Возвраты</th>
                  <th className="pb-2 font-medium">Логистика</th>
                  <th className="pb-2 font-medium">Приёмка, штрафы, прочее</th>
                  <th className="pb-2 font-medium">Итого удержано</th>
                </tr>
              </thead>
              <tbody>
                {notSold.map((p) => (
                  <tr key={p.nmId} className="border-t border-slate-100 text-right tabular-nums">
                    <td className="max-w-xs py-2 pr-3 text-left">
                      <div className="font-medium">{p.title ?? `Артикул WB ${p.nmId}`}</div>
                      <div className="text-xs text-slate-400">
                        {p.saName ?? '—'} · WB {p.nmId}
                      </div>
                    </td>
                    <td className="py-2 pr-3">{p.returns ? `${p.returns} шт` : ''}</td>
                    <td className="py-2 pr-3 text-rose-700">{p.delivery ? tenge(-p.delivery) : ''}</td>
                    <td className="py-2 pr-3 text-rose-700">{p.other ? tenge(-p.other) : ''}</td>
                    <td className="py-2 font-semibold text-red-600">{tenge(p.payout)}</td>
                  </tr>
                ))}
                {t.generalCharges !== 0 && (
                  <tr className="border-t border-slate-100 text-right tabular-nums text-slate-500">
                    <td className="py-2 pr-3 text-left">Общие расходы склада (хранение, перевозка без артикула)</td>
                    <td colSpan={3} />
                    <td className="py-2 font-semibold text-red-600">{tenge(-t.generalCharges)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title={`Товары с продажами · ${sold.length}`}>
        <div className="-mt-2 mb-3 flex flex-wrap items-center gap-2 text-sm print:hidden">
          <span className="text-slate-500">Показать суммы:</span>
          {[
            { key: 'total', label: 'за всё проданное', href: `?ids=${encodeURIComponent(ids)}` },
            { key: 'unit', label: 'за 1 шт', href: `?ids=${encodeURIComponent(ids)}&per=unit` },
          ].map((o) => (
            <Link
              key={o.key}
              href={o.href}
              scroll={false}
              className={`rounded-full px-3 py-1 font-medium ${(o.key === 'unit') === perUnit ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700 hover:bg-violet-100'}`}
            >
              {o.label}
            </Link>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="text-right text-xs text-slate-500">
              <tr>
                <th className="pb-2 text-left font-medium">Товар</th>
                <th className="pb-2 font-medium">Продано</th>
                {['Реализовано', 'Вознагр. WB', 'Логистика', 'Прочее', 'К оплате'].map((h) => (
                  <th key={h} className="pb-2 font-medium">
                    {h}
                    {perUnit && ', шт'}
                  </th>
                ))}
                <th className="pb-2 font-medium">Себест., шт</th>
                <th className="pb-2 font-medium">Прибыль{perUnit && ', шт'}</th>
                <th className="pb-2 font-medium">Маржа</th>
              </tr>
            </thead>
            <tbody>
              {sold.map((p) => (
                <tr key={p.nmId} className="border-t border-slate-100 text-right tabular-nums hover:bg-violet-50/40">
                  <td className="max-w-xs py-2 pr-3 text-left">
                    <a href={`https://www.wildberries.ru/catalog/${p.nmId}/detail.aspx`} target="_blank" rel="noreferrer" className="font-medium hover:text-violet-700 hover:underline">
                      {p.title ?? `Артикул WB ${p.nmId}`}
                    </a>
                    <div className="text-xs text-slate-400">
                      {p.saName ?? '—'} · WB {p.nmId}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    {p.units}
                    {p.returns ? <span className="text-xs text-rose-500"> −{p.returns}</span> : null}
                  </td>
                  <td className="py-2 pr-3 font-semibold">{tenge(by(p, p.revenue))}</td>
                  <td className="py-2 pr-3 text-rose-700">{tenge(by(p, -p.commission))}</td>
                  <td className="py-2 pr-3 text-rose-700">{tenge(by(p, -p.delivery))}</td>
                  <td className="py-2 pr-3 text-rose-700">{p.other ? tenge(by(p, -p.other)) : ''}</td>
                  <td className="py-2 pr-3">{tenge(by(p, p.payout))}</td>
                  <td className="py-2 pr-3 print:hidden">
                    <CostInput shopId={shopId} nmId={p.nmId} value={p.costPrice} />
                  </td>
                  <td className={`py-2 pr-3 font-semibold ${p.netProfit === null ? 'text-slate-300' : p.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{tenge(by(p, p.netProfit))}</td>
                  <td className="py-2">{pct(p.marginPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-slate-400">
        К оплате = к перечислению за товар − логистика − хранение − приёмка − штрафы − удержания + корректировки WB. Прибыль = к
        оплате − себестоимость − налог {data.taxPercent}% от реализованного.
      </p>
    </div>
  );
}
