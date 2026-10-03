'use client';

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface ProfitStructureItem {
  label: string;
  /** Выручка и прибыль — положительные, расходы — отрицательные. */
  value: number;
  kind: 'revenue' | 'expense' | 'profit';
}

const COLORS: Record<ProfitStructureItem['kind'], string> = {
  revenue: '#22c55e',
  expense: '#ef4444',
  profit: '#15803d',
};

const short = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000).toLocaleString('ru-RU')}K`;
  return value.toLocaleString('ru-RU');
};

export function ProfitStructureChart({ data }: { data: ProfitStructureItem[] }) {
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} interval={0} />
          <YAxis tickFormatter={short} tickLine={false} axisLine={false} fontSize={12} width={60} />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Tooltip formatter={(value: number) => `${Math.abs(value).toLocaleString('ru-RU')} ₸`} />
          <Bar dataKey="value" radius={4}>
            {data.map((d) => (
              <Cell key={d.label} fill={COLORS[d.kind]} />
            ))}
            <LabelList dataKey="value" position="top" formatter={(v: number) => short(Math.abs(v))} fontSize={11} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
