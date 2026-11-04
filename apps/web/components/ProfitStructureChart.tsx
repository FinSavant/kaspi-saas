'use client';

import { useId } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface ProfitStructureItem {
  label: string;
  /** Выручка и прибыль — положительные, расходы — отрицательные. */
  value: number;
  kind: 'revenue' | 'expense' | 'profit';
}

const COLORS: Record<ProfitStructureItem['kind'], [string, string]> = {
  revenue: ['#2563eb', '#38bdf8'],
  expense: ['#f43f5e', '#fda4af'],
  profit: ['#059669', '#6ee7b7'],
};

const short = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
  if (abs >= 1_000) return `${Math.round(value / 1_000).toLocaleString('ru-RU')} тыс`;
  return value.toLocaleString('ru-RU');
};

export function ProfitStructureChart({ data }: { data: ProfitStructureItem[] }) {
  const uid = useId().replace(/:/g, '');
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {(Object.keys(COLORS) as ProfitStructureItem['kind'][]).map((k) => (
              <linearGradient key={k} id={`${uid}-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS[k][0]} />
                <stop offset="100%" stopColor={COLORS[k][1]} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval={0} tick={{ fill: '#64748b' }} />
          <YAxis tickFormatter={short} tickLine={false} axisLine={false} fontSize={11} width={56} tick={{ fill: '#64748b' }} />
          <ReferenceLine y={0} stroke="#cbd5e1" />
          <Tooltip
            formatter={(value: number) => `${Math.abs(value).toLocaleString('ru-RU')} ₸`}
            cursor={{ fill: 'rgba(148,163,184,0.12)' }}
            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(15,23,42,.12)', fontSize: 12 }}
          />
          <Bar dataKey="value" radius={[6, 6, 6, 6]} maxBarSize={44} animationDuration={900}>
            {data.map((d) => (
              <Cell key={d.label} fill={`url(#${uid}-${d.kind})`} />
            ))}
            <LabelList dataKey="value" position="top" formatter={(v: number) => short(Math.abs(v))} fontSize={11} fill="#475569" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
