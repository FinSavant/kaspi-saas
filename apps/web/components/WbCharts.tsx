'use client';

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const short = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
  if (abs >= 1_000) return `${Math.round(value / 1_000).toLocaleString('ru-RU')} тыс`;
  return Math.round(value).toLocaleString('ru-RU');
};
const tenge = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₸`;

export interface WaterfallStep {
  label: string;
  /** Положительное — приход, отрицательное — удержание; total — итоговый столбец от нуля. */
  value: number;
  total?: boolean;
}

/**
 * «Куда ушли деньги»: от реализованного через удержания WB к оплате и прибыли.
 * Каждый столбец удержания висит на уровне остатка — видно, сколько съела каждая статья.
 */
export function WbWaterfall({ steps }: { steps: WaterfallStep[] }) {
  let level = 0;
  const data = steps.map((s) => {
    if (s.total) {
      level = s.value;
      return { label: s.label, base: Math.min(0, s.value), bar: Math.abs(s.value), value: s.value, kind: s.value >= 0 ? 'total' : 'loss' };
    }
    const from = level;
    level += s.value;
    return { label: s.label, base: Math.min(from, level), bar: Math.abs(s.value), value: s.value, kind: s.value >= 0 ? 'plus' : 'minus' };
  });
  const color = { total: '#7c3aed', loss: '#dc2626', plus: '#10b981', minus: '#f43f5e' } as const;
  return (
    <div className="h-96 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="#ede9fe" vertical={false} />
          {/* Подписи наклонены: статей много, по горизонтали они налезают друг на друга */}
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-35} textAnchor="end" height={70} />
          <YAxis tickFormatter={short} tickLine={false} axisLine={false} fontSize={11} width={64} />
          <Tooltip formatter={(_: number, __: string, item: { payload?: { value: number } }) => tenge(item.payload?.value ?? 0)} cursor={{ fill: '#f5f3ff' }} />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="bar" stackId="w" radius={[6, 6, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.label} fill={color[d.kind as keyof typeof color]} />
            ))}
            <LabelList dataKey="value" position="top" formatter={(v: number) => short(v)} fontSize={11} fill="#475569" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Продажи по дням: столбцы — реализовано, подпись — штуки. */
export function WbDailyChart({ data }: { data: { date: string; units: number; revenue: number }[] }) {
  const rows = data.map((d) => ({ ...d, day: d.date.slice(8, 10) + '.' + d.date.slice(5, 7) }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#ede9fe" vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickFormatter={short} tickLine={false} axisLine={false} fontSize={11} width={64} />
          <Tooltip
            formatter={(v: number, name: string) => (name === 'revenue' ? [tenge(v), 'Реализовано'] : [`${v} шт`, 'Продано'])}
            labelFormatter={(l) => `Дата: ${l}`}
            cursor={{ fill: '#f5f3ff' }}
          />
          <Bar dataKey="revenue" fill="#8b5cf6" radius={[6, 6, 0, 0]}>
            <LabelList dataKey="units" position="top" formatter={(v: number) => `${v} шт`} fontSize={10} fill="#6d28d9" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const DONUT = ['#7c3aed', '#f43f5e', '#f59e0b', '#06b6d4', '#64748b', '#a855f7', '#10b981'];

/** Структура удержаний WB — кольцо с долями. */
export function WbExpenseDonut({ items }: { items: { label: string; value: number }[] }) {
  const data = items.filter((i) => i.value > 0);
  const total = data.reduce((s, i) => s + i.value, 0);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={52} outerRadius={84} paddingAngle={2} stroke="none">
              {data.map((d, i) => (
                <Cell key={d.label} fill={DONUT[i % DONUT.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => tenge(v)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: DONUT[i % DONUT.length] }} />
            <span className="flex-1 text-slate-600">{d.label}</span>
            <span className="font-semibold tabular-nums">{tenge(d.value)}</span>
            <span className="w-12 text-right text-xs text-slate-400 tabular-nums">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
