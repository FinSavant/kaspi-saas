'use client';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface LineSpec {
  key: string;
  name: string;
  color: string;
}

const format = (value: number) => value.toLocaleString('ru-RU');

export function SimpleLineChart({
  data,
  xKey,
  lines,
  unit = '',
}: {
  data: Record<string, string | number | null>[];
  xKey: string;
  lines: LineSpec[];
  unit?: string;
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickFormatter={format} tickLine={false} axisLine={false} fontSize={12} width={70} />
          <Tooltip formatter={(value: number) => `${format(value)}${unit}`} />
          {lines.length > 1 && <Legend />}
          {lines.map((line) => (
            <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
