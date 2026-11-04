// Цвета групп колонок таблицы демпинг-бота: шапка и ячейки одной группы одного цвета.
export const COL = {
  price: 'bg-sky-50',
  cost: 'bg-rose-50',
  bot: 'bg-amber-50',
  toggle: 'bg-emerald-50',
  preorder: 'bg-indigo-50',
};

/** «Товары» — цены, склады, себестоимость, предзаказ; «Робот цен» — всё для демпинга. */
export type ProductsView = 'products' | 'robot';

export type ColumnKey = 'name' | 'price' | 'position' | 'stores' | 'cost' | 'markup' | 'floor' | 'ceiling' | 'step' | 'preorder' | 'bot' | 'status';

const VIEW_COLUMNS: Record<ProductsView, ColumnKey[]> = {
  products: ['name', 'price', 'stores', 'cost', 'preorder', 'status'],
  robot: ['name', 'price', 'stores', 'position', 'cost', 'markup', 'floor', 'ceiling', 'step', 'bot', 'preorder', 'status'],
};

/**
 * Скрытая колонка остаётся в разметке (display: none): её поля входят в форму строки,
 * и сохранение не стирает значения, которых на этой вкладке не видно.
 */
export const hiddenIn = (view: ProductsView, key: ColumnKey) => (VIEW_COLUMNS[view].includes(key) ? '' : 'hidden');

export const HEADERS: { key: ColumnKey; label: string; className: string }[] = [
  { key: 'name', label: 'Товар', className: 'w-[23.5%] text-left text-slate-700' },
  { key: 'price', label: 'Цена', className: `w-[7%] ${COL.price} text-right text-sky-800` },
  { key: 'stores', label: 'Склад · наличие · остаток', className: 'w-[11%] text-right text-slate-700' },
  { key: 'position', label: 'Позиция', className: 'w-[10.5%] text-center text-slate-700' },
  { key: 'cost', label: 'Себестоимость', className: `w-[7.5%] ${COL.cost} text-right text-rose-800` },
  { key: 'markup', label: 'Себестоимость + %', className: `w-[7.5%] ${COL.cost} text-right text-rose-800` },
  { key: 'floor', label: 'Мин. цена', className: `w-[6%] ${COL.bot} text-right text-amber-900` },
  { key: 'ceiling', label: 'Макс. цена', className: `w-[6%] ${COL.bot} text-right text-amber-900` },
  { key: 'step', label: 'Шаг', className: `w-[5.5%] ${COL.bot} text-right text-amber-900` },
  { key: 'bot', label: 'Бот', className: `w-[4.5%] ${COL.toggle} text-center text-emerald-800` },
  { key: 'preorder', label: 'Предзаказ, дн.', className: `w-[6.5%] ${COL.preorder} text-right text-indigo-800` },
  { key: 'status', label: '', className: 'w-[24px] ' },
];
