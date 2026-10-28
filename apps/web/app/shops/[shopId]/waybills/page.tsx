import { api } from '@/lib/api';
import { HelpTip } from '@/components/HelpTip';
import { TIPS } from '@/lib/tips';
import { PrintForm, ReprintForm } from './PrintForm';

export const dynamic = 'force-dynamic';

interface Batch {
  id: string;
  layout: 'THERMAL' | 'A4_X4' | 'A4_X8';
  count: number;
  createdAt: string;
}

const LAYOUT_LABELS: Record<Batch['layout'], string> = {
  THERMAL: 'Термопринтер, 100×150 мм',
  A4_X4: 'A4, 4 на листе',
  A4_X8: 'A4, 8 на листе',
};

const LAYOUT_VALUES: Record<Batch['layout'], string> = {
  THERMAL: 'thermal',
  A4_X4: 'a4x4',
  A4_X8: 'a4x8',
};

const formatDate =(iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'short', timeStyle: 'short' });

export default async function WaybillsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const [batches, shops] = await Promise.all([
    api<Batch[]>(`/shops/${shopId}/waybill-batches`),
    api<{ id: string; name: string }[]>('/shops'),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Накладные</h1>
            <HelpTip {...TIPS.waybills} />
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Склеиваются только заказы из вкладки «Передача», которые ещё не печатались. «Упаковка» и уже переданные
            в доставку не затрагиваются.
          </p>
        </div>
      </div>

      <PrintForm shopId={shopId} shops={shops} />

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-medium text-slate-600">История склеек <span className="font-normal text-slate-400">· хранится сутки</span></h2>
        {batches.length === 0 ? (
          <p className="text-sm text-slate-500">Пока ничего не склеивалось.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-2 font-medium">Когда</th>
                <th className="pb-2 font-medium">Формат</th>
                <th className="pb-2 text-right font-medium">Накладных</th>
                <th className="pb-2" />
                <th className="pb-2 pl-4 text-right font-medium">Пересобрать в другом формате</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-t border-slate-200">
                  <td className="py-2 tabular-nums">{formatDate(batch.createdAt)}</td>
                  <td className="py-2">{LAYOUT_LABELS[batch.layout]}</td>
                  <td className="py-2 text-right tabular-nums">{batch.count}</td>
                  <td className="py-2 text-right">
                    <a href={`/shops/${shopId}/waybills/${batch.id}/pdf`} className="underline">
                      Скачать PDF
                    </a>
                  </td>
                  <td className="py-2 pl-4">
                    <ReprintForm shopId={shopId} batchId={batch.id} currentLayout={LAYOUT_VALUES[batch.layout]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
