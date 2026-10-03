// Цвета групп колонок таблицы демпинг-бота: шапка и ячейки одной группы одного цвета.
export const COL = {
  price: 'bg-sky-50',
  cost: 'bg-rose-50',
  bot: 'bg-amber-50',
  toggle: 'bg-emerald-50',
};

export const HEADERS: { label: string; className: string }[] = [
  { label: 'Товар', className: 'text-left text-slate-700' },
  { label: 'Карточка', className: 'text-left text-slate-700' },
  { label: 'Цена, ₸', className: `${COL.price} text-right text-sky-800` },
  { label: 'Остаток', className: 'text-right text-slate-700' },
  { label: 'Себестоимость', className: `${COL.cost} text-right text-rose-800` },
  { label: 'Мин. цена', className: `${COL.bot} text-right text-amber-900` },
  { label: 'Макс. цена', className: `${COL.bot} text-right text-amber-900` },
  { label: 'Шаг', className: `${COL.bot} text-right text-amber-900` },
  { label: 'Бот', className: `${COL.toggle} text-center text-emerald-800` },
  { label: '', className: '' },
];
