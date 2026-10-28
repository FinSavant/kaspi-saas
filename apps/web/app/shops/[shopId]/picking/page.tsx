import { ShopTabs } from '@/components/ShopTabs';
import { HelpTip } from '@/components/HelpTip';
import { TIPS } from '@/lib/tips';
import { api } from '@/lib/api';
import { Picking, type PickingGroup } from './Picking';

export const dynamic = 'force-dynamic';

export default async function PickingPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const shops = await api<{ id: string; name: string }[]>('/shops');
  let groups: PickingGroup[] = [];
  let error: string | null = null;
  try {
    groups = await api<PickingGroup[]>(`/shops/${shopId}/picking`);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Не удалось загрузить заказы.';
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">📦 Сборка</h1>
            <HelpTip {...TIPS.picking} />
          </div>
          <ShopTabs shops={shops} shopId={shopId} section="picking" />
        </div>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Заказы из вкладки «Передача», сгруппированные по товарам: сколько штук взять с полки и в какие заказы
          разложить. Галочки сохраняются сразу.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">В «Передаче» сейчас нет заказов.</p>
      ) : (
        <Picking key={shopId} shopId={shopId} groups={groups} />
      )}
    </div>
  );
}
