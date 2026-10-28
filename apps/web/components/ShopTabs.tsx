import Link from 'next/link';

/** Переключение магазина прямо на странице раздела; `query` — что сохранить в адресе (фильтр, сортировку). */
export function ShopTabs({ shops, shopId, section, query = '' }: { shops: { id: string; name: string }[]; shopId: string; section: string; query?: string }) {
  if (shops.length <= 1) return null;
  return (
    <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-sm">
      {shops.map((s) => (
        <Link
          key={s.id}
          href={`/shops/${s.id}/${section}${query ? `?${query}` : ''}`}
          className={`rounded-md px-3 py-1.5 font-medium whitespace-nowrap ${
            s.id === shopId ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          {s.name}
        </Link>
      ))}
    </div>
  );
}
