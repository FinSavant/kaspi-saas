'use client';

import { useId } from 'react';
import { Area, AreaChart, Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Единая палитра графиков кабинета SANQ. */
export const PALETTE = {
  blue: '#2563eb',
  emerald: '#10b981',
  violet: '#7c3aed',
  amber: '#f59e0b',
  rose: '#f43f5e',
  sky: '#0ea5e9',
  slate: '#94a3b8',
};
export const DONUT_COLORS = [PALETTE.blue, PALETTE.rose, PALETTE.amber, PALETTE.violet, PALETTE.sky, PALETTE.emerald, '#14b8a6', '#ec4899', PALETTE.slate];

const full = (v: number) => v.toLocaleString('ru-RU');
export const short = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
  if (abs >= 1_000) return `${Math.round(value / 1_000).toLocaleString('ru-RU')} тыс`;
  return value.toLocaleString('ru-RU');
};

interface TipProps {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
  unit?: string;
}

function Tip({ active, payload, label, unit = '' }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-1 font-semibold text-slate-900">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey ?? p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-600">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <b className="tabular-nums text-slate-900">
            {full(Number(p.value ?? 0))}
            {unit}
          </b>
        </div>
      ))}
    </div>
  );
}

export interface SeriesSpec {
  key: string;
  name: string;
  color: string;
}

/** Области с градиентом и плавной анимацией — динамика выручки и прибыли. */
export function AreaTrendChart({
  data,
  xKey,
  series,
  unit = ' ₸',
  height = 288,
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  series: SeriesSpec[];
  unit?: string;
  height?: number;
}) {
  const uid = useId().replace(/:/g, '');
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} tick={{ fill: '#64748b' }} minTickGap={24} />
          <YAxis tickFormatter={short} tickLine={false} axisLine={false} fontSize={11} tick={{ fill: '#64748b' }} width={56} />
          <Tooltip content={<Tip unit={unit} />} cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2.5}
              fill={`url(#${uid}-${s.key})`}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
              animationDuration={900}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Столбцы выручки с линией числа заказов (вторая ось). */
export function RevenueBarsChart({
  data,
  xKey,
  height = 300,
}: {
  data: { label: string; revenue: number; orders: number }[];
  xKey: string;
  height?: number;
}) {
  const uid = useId().replace(/:/g, '');
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`${uid}-bar`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE.blue} stopOpacity={1} />
              <stop offset="100%" stopColor={PALETTE.sky} stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={11} tick={{ fill: '#64748b' }} minTickGap={16} />
          <YAxis yAxisId="rev" tickFormatter={short} tickLine={false} axisLine={false} fontSize={11} tick={{ fill: '#64748b' }} width={56} />
          <YAxis yAxisId="ord" orientation="right" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: '#64748b' }} width={36} />
          <Tooltip content={<Tip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="rev" dataKey="revenue" name="Выручка, ₸" fill={`url(#${uid}-bar)`} radius={[6, 6, 0, 0]} maxBarSize={38} animationDuration={900} />
          <Line yAxisId="ord" type="monotone" dataKey="orders" name="Заказы" stroke={PALETTE.amber} strokeWidth={2.5} dot={{ r: 3, fill: PALETTE.amber, strokeWidth: 0 }} animationDuration={900} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface DonutItem {
  label: string;
  value: number;
  color?: string;
}

/** Донат-диаграмма с итогом в центре и легендой с долями. */
export function DonutChart({ items, centerLabel, centerValue }: { items: DonutItem[]; centerLabel: string; centerValue: string }) {
  const rows = items.filter((i) => i.value > 0);
  const total = rows.reduce((s, i) => s + i.value, 0);
  if (rows.length === 0) return <p className="text-sm text-slate-500">Нет данных за период.</p>;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-52 w-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="label" innerRadius="64%" outerRadius="100%" paddingAngle={2} stroke="none" animationDuration={900}>
              {rows.map((r, i) => (
                <Cell key={r.label} fill={r.color ?? DONUT_COLORS[i % DONUT_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<Tip unit=" ₸" />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <div className="text-[11px] tracking-wide text-slate-500 uppercase">{centerLabel}</div>
          <div className="text-lg font-bold tabular-nums text-slate-900">{centerValue}</div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
        {rows.map((r, i) => (
          <li key={r.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color ?? DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="truncate">{r.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-slate-600">
              {short(r.value)} ₸ · <b className="text-slate-900">{Math.round((r.value / total) * 1000) / 10}%</b>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
