import { api } from '@/lib/api';
import { HelpTip } from '@/components/HelpTip';
import { TIPS } from '@/lib/tips';
import { HandoverPanel } from './HandoverPanel';
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

type ShopBatch = Batch & { shopName: string };
interface BatchGroup {
  /** id склеек магазинов через запятую */
  ids: string;
  hrefIds: string[];
  layout: Batch['layout'];
  count: number;
  createdAt: string;
  shopNames: string[];
}

/** Склейки разных магазинов, сделанные одним нажатием (с разницей в пару минут), показываем одной строкой. */
const GROUP_GAP_MS = 3 * 60 * 1000;
function groupBatches(all: ShopBatch[]): BatchGroup[] {
  const sorted = [...all].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const groups: (BatchGroup & { last: number })[] = [];
  for (const b of sorted) {
    const time = +new Date(b.createdAt);
    const g = groups.find((x) => x.layout === b.layout && !x.shopNames.includes(b.shopName) && x.last - time <= GROUP_GAP_MS);
    if (g) {
      g.hrefIds.push(b.id);
      g.ids = g.hrefIds.join(',');
      g.count += b.count;
      g.shopNames.push(b.shopName);
      g.last = time;
    } else {
      groups.push({ ids: b.id, hrefIds: [b.id], layout: b.layout, count: b.count, createdAt: b.createdAt, shopNames: [b.shopName], last: time });
    }
  }
  return groups;
}

const formatDate =(iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', dateStyle: 'short', timeStyle: 'short' });

export default async function WaybillsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const shops = await api<{ id: string; name: string }[]>('/shops');
  // История — по всем магазинам, а не только по текущему
  const perShop = await Promise.all(
    shops.map(async (shop) => (await api<Batch[]>(`/shops/${shop.id}/waybill-batches`)).map((b) => ({ ...b, shopName: shop.name }))),
  );
  const batches = groupBatches(perShop.flat());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Накладные</h1>
            <HelpTip {...TIPS.waybills} />
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Склеиваются только заказы из вкладки «Передача», которые ещё не печатались. Заказы из «Упаковки» можно сначала передать кнопкой ниже; уже переданные
            в доставку не затрагиваются.
          </p>
        </div>
      </div>

      <HandoverPanel shopId={shopId} shops={shops} />

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
                {shops.length > 1 && <th className="pb-2 font-medium">Магазин</th>}
                <th className="pb-2 font-medium">Формат</th>
                <th className="pb-2 text-right font-medium">Накладных</th>
                <th className="pb-2" />
                <th className="pb-2 pl-4 text-right font-medium">Пересобрать в другом формате</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.ids} className="border-t border-slate-200">
                  <td className="py-2 tabular-nums">{formatDate(batch.createdAt)}</td>
                  {shops.length > 1 && <td className="py-2 text-xs">{batch.shopNames.join(', ')}</td>}
                  <td className="py-2">{LAYOUT_LABELS[batch.layout]}</td>
                  <td className="py-2 text-right tabular-nums">{batch.count}</td>
                  <td className="py-2 text-right">
                    <a
                      href={
                        batch.hrefIds.length > 1
                          ? `/shops/${shopId}/waybills/combined/pdf?ids=${batch.ids}`
                          : `/shops/${shopId}/waybills/${batch.ids}/pdf`
                      }
                      className="underline"
                    >
                      Скачать PDF
                    </a>
                  </td>
                  <td className="py-2 pl-4">
                    <ReprintForm shopId={shopId} batchId={batch.ids} currentLayout={LAYOUT_VALUES[batch.layout]} />
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
