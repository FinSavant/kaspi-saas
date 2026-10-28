'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { logout } from '@/app/(auth)/actions';
import { Logo } from './Logo';

/** Пункт меню → раздел тарифа; без него пункт виден всегда. */
const ITEM_FEATURE: Record<string, string> = {
  products: 'products',
  waybills: 'waybills',
  picking: 'picking',
  robot: 'robot',
  reviews: 'reviews',
  analytics: 'analytics',
};

const GROUPS = [
  {
    title: 'Kaspi',
    items: [
      { path: 'home', label: 'Главная', icon: '🏠' },
      { path: 'products', label: 'Товары/Предзаказ', icon: '🏷️' },
      { path: 'waybills', label: 'Накладные', icon: '🧾' },
      { path: 'picking', label: 'Сборка', icon: '📦' },
      { path: 'robot', label: 'Робот цен', icon: '🤖' },
      { path: 'reviews', label: 'Отзывы', icon: '💬' },
      { path: 'analytics', label: 'Аналитика', icon: '📈' },
    ],
  },
  {
    title: 'Wildberries',
    // Раздел в разработке — виден только владельцу платформы
    adminOnly: true,
    items: [
      { path: 'wb/reports', label: 'Отчёты WB', icon: '🟣' },
      { path: 'wb/products', label: 'Товары WB', icon: '🏷️' },
    ],
  },
  {
    title: 'Аккаунт',
    items: [
      { path: 'billing', label: 'Тарифы', icon: '💳' },
      { path: 'settings', label: 'Настройки', icon: '⚙️' },
    ],
  },
];

/** Свёрнутая панель запоминается в браузере; без хранилища (приватный режим) просто не запоминается. */
const COLLAPSED_KEY = 'sidebar-collapsed';

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

function NavLinks({
  shopId,
  collapsed,
  isAdmin,
  features,
  onNavigate,
}: {
  shopId: string;
  collapsed: boolean;
  isAdmin: boolean;
  features: string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3">
      {GROUPS.filter((g) => isAdmin || !('adminOnly' in g)).map((group) => (
        <div key={group.title}>
          {!collapsed && <div className="px-2 pb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">{group.title}</div>}
          <ul className="space-y-1">
            {group.items.filter((item) => !ITEM_FEATURE[item.path] || features.includes(ITEM_FEATURE[item.path]!)).map((item) => {
              const href = `/shops/${shopId}/${item.path}`;
              const active = pathname.startsWith(href);
              return (
                <li key={item.path}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 rounded-lg py-2 text-sm ${collapsed ? 'justify-center px-0' : 'px-3'} ${
                      active
                        ? `${item.path.startsWith('wb/') ? 'bg-violet-700' : 'bg-emerald-600'} font-medium text-white`
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span aria-hidden className="text-base">
                      {item.icon}
                    </span>
                    {!collapsed && item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Боковая панель. На компьютере сворачивается до иконок (кнопка « / »), на телефоне
 * скрыта: сверху полоса с кнопкой ☰, по нажатию панель выезжает поверх страницы.
 */
export function Sidebar({
  shopId,
  shops,
  isAdmin,
  email,
  features,
}: {
  shopId: string;
  shops: { id: string; name: string }[];
  isAdmin: boolean;
  email: string | null;
  features: string[];
}) {
  const pathname = usePathname();
  const section = pathname.split('/')[3] ?? 'home';
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = GROUPS.flatMap((g) => g.items).find((i) => pathname.startsWith(`/shops/${shopId}/${i.path}`));

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      /* хранилище недоступно — панель развёрнута */
    }
  }, []);
  // Переход на другую страницу закрывает выезжающую панель на телефоне
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* не запомнится — не страшно */
    }
  };

  const shopBlock = (
    <div className="space-y-2 border-t border-slate-200 px-5 py-4 text-sm">
      <div className="text-xs text-slate-400">Магазин</div>
      <ShopSwitcher shopId={shopId} shops={shops} section={section} />
      {isAdmin && (
        <Link href="/admin" className="block text-xs text-blue-600 hover:underline">
          Продавцы и подписки
        </Link>
      )}
      <form action={logout} className="flex items-center justify-between gap-2 pt-1">
        <span className="truncate text-xs text-slate-500" title={email ?? undefined}>
          {email}
        </span>
        <button type="submit" className="shrink-0 text-xs text-slate-500 hover:text-red-600">
          Выйти
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Телефон: полоса сверху */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden print:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Открыть меню"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-lg"
        >
          ☰
        </button>
        <span className="truncate font-semibold">
          {current ? `${current.icon} ${current.label}` : 'SANQ'}
        </span>
      </header>

      {/* Телефон: выезжающая панель */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-slate-900/40" />
          <aside className="absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
                <Logo />
              </Link>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Закрыть меню" className="text-2xl leading-none text-slate-500">
                ×
              </button>
            </div>
            <NavLinks shopId={shopId} collapsed={false} isAdmin={isAdmin} features={features} onNavigate={() => setMobileOpen(false)} />
            {shopBlock}
          </aside>
        </div>
      )}

      {/* Компьютер: панель слева, сворачивается до иконок */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] md:flex print:hidden ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        <div className={`flex items-center py-4 ${collapsed ? 'justify-center' : 'justify-between px-5'}`}>
          {!collapsed && (
            <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
                <Logo />
              </Link>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
            aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>
        <NavLinks shopId={shopId} collapsed={collapsed} isAdmin={isAdmin} features={features} />
        {!collapsed && shopBlock}
      </aside>
    </>
  );
}
