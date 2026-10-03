'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const GROUPS = [
  {
    title: 'Инструменты',
    items: [
      { path: 'waybills', label: 'Накладные', icon: '🧾' },
      { path: 'products', label: 'Демпинг-бот', icon: '🔁' },
      { path: 'analytics', label: 'Аналитика', icon: '📈' },
    ],
  },
  {
    title: 'Аккаунт',
    items: [{ path: 'settings', label: 'Настройки', icon: '⚙️' }],
  },
];

/** Выбор магазина: открывает тот же раздел в другом магазине. */
function ShopSwitcher({ shopId, shops, section }: { shopId: string; shops: { id: string; name: string }[]; section: string }) {
  const router = useRouter();
  const current = shops.find((s) => s.id === shopId);

  if (shops.length <= 1) {
    return (
      <div className="truncate font-medium text-slate-700" title={current?.name}>
        {current?.name ?? 'Магазин не найден'}
      </div>
    );
  }
  return (
    <select
      value={shopId}
      onChange={(e) => router.push(`/shops/${e.target.value}/${section}`)}
      className="w-full truncate rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-700"
      aria-label="Магазин"
    >
      {shops.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

export function Sidebar({ shopId, shops }: { shopId: string; shops: { id: string; name: string }[] }) {
  const pathname = usePathname();
  const section = pathname.split('/')[3] ?? 'analytics';

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
      <Link href="/" className="px-5 py-5 text-lg font-bold tracking-tight text-slate-900">
        Kaspi SaaS
      </Link>
      <nav className="flex-1 space-y-6 px-3">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <div className="px-2 pb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">{group.title}</div>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const href = `/shops/${shopId}/${item.path}`;
                const active = pathname.startsWith(href);
                return (
                  <li key={item.path}>
                    <Link
                      href={href}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                        active ? 'bg-emerald-600 font-medium text-white' : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span aria-hidden>{item.icon}</span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t border-slate-200 px-5 py-4 text-sm">
        <div className="text-xs text-slate-400">Магазин</div>
        <ShopSwitcher shopId={shopId} shops={shops} section={section} />
      </div>
    </aside>
  );
}
