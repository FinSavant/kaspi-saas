import type { WaybillSort, WaybillsJob } from '../queues';

/** Заказ из «Передачи» с тем, что нужно для фильтров и сортировки. */
export interface WaybillCandidate {
  code: string;
  city: string | null;
  express: boolean;
  createdAt: Date;
  /** Товары заказа: артикул и название. */
  items: { sku: string; name: string }[];
}

type Filters = Pick<WaybillsJob, 'excludeExpress' | 'createdFrom' | 'createdTo' | 'cities' | 'skus' | 'orderCodes' | 'sort'>;

const collator = new Intl.Collator('ru', { sensitivity: 'base', numeric: true });
const firstName = (c: WaybillCandidate) => [...c.items.map((i) => i.name)].sort(collator.compare)[0] ?? '';

/**
 * Отбирает и упорядочивает заказы для склейки так же, как фильтры печати:
 * пустой список фильтра означает «все».
 */
export function selectWaybillOrders<T extends WaybillCandidate>(orders: T[], filters: Filters): T[] {
  const has = (list?: string[]) => !!list && list.length > 0;
  const from = filters.createdFrom ? new Date(filters.createdFrom) : null;
  const to = filters.createdTo ? new Date(filters.createdTo) : null;

  const selected = orders.filter(
    (o) =>
      !(filters.excludeExpress && o.express) &&
      !(from && o.createdAt < from) &&
      !(to && o.createdAt > to) &&
      !(has(filters.cities) && !filters.cities!.includes(o.city ?? '')) &&
      !(has(filters.orderCodes) && !filters.orderCodes!.includes(o.code)) &&
      !(has(filters.skus) && !o.items.some((i) => filters.skus!.includes(i.sku))),
  );
  return sortWaybills(selected, filters.sort ?? 'none');
}

function sortWaybills<T extends WaybillCandidate>(orders: T[], sort: WaybillSort): T[] {
  if (sort === 'none') return orders;
  return [...orders].sort((a, b) => {
    const byName = collator.compare(firstName(a), firstName(b));
    if (byName !== 0 || sort === 'product') return byName;
    return collator.compare(a.city ?? '', b.city ?? '');
  });
}
