'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type DragEvent } from 'react';
import { deleteWbReport } from './actions';

export interface ReportListItem {
  reportId: string;
  dateFrom: string | null;
  dateTo: string | null;
  source: 'file' | 'api';
  fileName: string | null;
  totals: { units: number; returns: number; revenue: number; payout: number; netProfit: number; costCoveragePercent: number | null };
}

const tenge = (v: number) => `${Math.round(v).toLocaleString('ru-RU')} ₸`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'UTC', day: '2-digit', month: '2-digit' }) : '—');
const year = (iso: string | null) => (iso ? new Date(iso).getUTCFullYear() : '');

/** Загрузка zip / xlsx из кабинета WB: перетащить или выбрать, можно несколько сразу. */
export function UploadBox({ shopId }: { shopId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<{ ok: boolean; text: string }[]>([]);

  async function upload(files: FileList | File[]) {
    const list = [...files];
    if (list.length === 0) return;
    setBusy(true);
    setMessages([]);
    const form = new FormData();
    for (const f of list) form.append('files', f);
    try {
      const res = await fetch(`/shops/${shopId}/wb/upload`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) setMessages([{ ok: false, text: data?.error ?? 'Не удалось загрузить.' }]);
      else
        setMessages(
          (data.results as { file: string; error?: string; reports?: { reportId: string; rows: number }[] }[]).map((r) =>
            r.error
              ? { ok: false, text: `${r.file}: ${r.error}` }
              : { ok: true, text: `✓ ${r.reports!.map((x) => `отчёт №${x.reportId} — ${x.rows} строк`).join(', ')}` },
          ),
        );
      router.refresh();
    } catch {
      setMessages([{ ok: false, text: 'Сеть недоступна — попробуйте ещё раз.' }]);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void upload(e.dataTransfer.files);
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        disabled={busy}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
          drag ? 'border-violet-500 bg-violet-50' : 'border-violet-200 bg-white hover:border-violet-400 hover:bg-violet-50/50'
        }`}
      >
        <span className="text-3xl">{busy ? '⏳' : '📥'}</span>
        <span className="font-semibold text-violet-900">{busy ? 'Загружаю и разбираю отчёт…' : 'Перетащите сюда отчёты WB или нажмите, чтобы выбрать'}</span>
        <span className="text-sm text-slate-500">zip или Excel из кабинета: Финансы → Финансовые отчёты → «Скачать детализацию». Можно несколько файлов сразу.</span>
      </button>
      <input ref={input} type="file" accept=".zip,.xlsx" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
      {messages.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {messages.map((m, i) => (
            <li key={i} className={m.ok ? 'text-emerald-700' : 'text-red-600'}>
              {m.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Список отчётов: галочками выбираются недели для сводного отчёта. */
export function ReportsTable({ shopId, reports }: { shopId: string; reports: ReportListItem[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const all = selected.size === reports.length && reports.length > 0;
  const chosen = reports.filter((r) => selected.has(r.reportId));
  const sum = (key: keyof ReportListItem['totals']) => chosen.reduce((s, r) => s + (r.totals[key] ?? 0), 0);

  const remove = (r: ReportListItem) => {
    if (!window.confirm(`Удалить отчёт №${r.reportId}? Его можно будет загрузить снова.`)) return;
    start(async () => {
      await deleteWbReport(shopId, r.reportId);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div
        className={`sticky top-14 z-10 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm transition md:top-2 ${
          chosen.length ? 'bg-violet-700 text-white shadow-lg' : 'bg-white text-slate-500 ring-1 ring-slate-200'
        }`}
      >
        {chosen.length ? (
          <>
            <span className="font-semibold">Выбрано недель: {chosen.length}</span>
            <span>Реализовано {tenge(sum('revenue'))}</span>
            <span>К оплате {tenge(sum('payout'))}</span>
            <span>Прибыль {tenge(sum('netProfit'))}</span>
            <div className="flex-1" />
            <Link
              href={`/shops/${shopId}/wb/reports/view?ids=${chosen.map((r) => r.reportId).join(',')}`}
              className="rounded-lg bg-white px-4 py-1.5 font-semibold text-violet-800 hover:bg-violet-50"
            >
              {chosen.length > 1 ? 'Открыть сводный отчёт →' : 'Открыть отчёт →'}
            </Link>
          </>
        ) : (
          <span>Отметьте одну или несколько недель — получите сводный отчёт за весь период.</span>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-violet-50/60 text-left text-xs text-violet-900/70 uppercase">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={all}
                  onChange={() => setSelected(all ? new Set() : new Set(reports.map((r) => r.reportId)))}
                  aria-label="Выбрать все"
                  className="h-4 w-4 accent-violet-700"
                />
              </th>
              <th className="px-3 py-3 font-semibold">Неделя</th>
              <th className="px-3 py-3 font-semibold">Отчёт</th>
              <th className="px-3 py-3 text-right font-semibold">Продано</th>
              <th className="px-3 py-3 text-right font-semibold">Реализовано</th>
              <th className="px-3 py-3 text-right font-semibold">К оплате</th>
              <th className="px-3 py-3 text-right font-semibold">Прибыль</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.reportId} className={`border-t border-slate-100 ${selected.has(r.reportId) ? 'bg-violet-50/70' : 'hover:bg-slate-50'}`}>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(r.reportId)} onChange={() => toggle(r.reportId)} className="h-4 w-4 accent-violet-700" />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className="font-semibold">
                    {day(r.dateFrom)} – {day(r.dateTo)}
                  </span>{' '}
                  <span className="text-xs text-slate-400">{year(r.dateTo)}</span>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <Link href={`/shops/${shopId}/wb/reports/view?ids=${r.reportId}`} className="text-violet-700 hover:underline">
                    №{r.reportId}
                  </Link>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${r.source === 'file' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
                    title={r.source === 'file' ? `Загружен файлом: ${r.fileName ?? ''}` : 'Пришёл через API WB'}
                  >
                    {r.source === 'file' ? 'файл' : 'API'}
                  </span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {r.totals.units} шт{r.totals.returns ? <span className="text-xs text-rose-500"> −{r.totals.returns}</span> : null}
                </td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{tenge(r.totals.revenue)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{tenge(r.totals.payout)}</td>
                <td className={`px-3 py-3 text-right font-semibold tabular-nums ${r.totals.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {tenge(r.totals.netProfit)}
                  {r.totals.costCoveragePercent !== null && r.totals.costCoveragePercent < 100 && (
                    <div className="text-[11px] font-normal text-amber-600">себест. {Math.round(r.totals.costCoveragePercent)}%</div>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <button type="button" onClick={() => remove(r)} disabled={pending} title="Удалить отчёт" className="text-slate-300 hover:text-red-500">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {reports.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Отчётов пока нет — загрузите первый файл выше.</p>}
      </div>
    </div>
  );
}
