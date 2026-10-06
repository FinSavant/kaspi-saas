'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export interface DropdownItem {
  href: string;
  label: string;
  count?: number;
  active: boolean;
}

/** Кнопка со списком ссылок, как фильтр в Okto: выбранный пункт отмечен ✓, клик вне списка закрывает его. */
export function DropdownMenu({ icon, items }: { icon: string; items: DropdownItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = items.find((i) => i.active) ?? items[0]!;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap shadow-sm ${
          open ? 'border-amber-400 bg-white' : 'border-slate-300 bg-white hover:bg-slate-50'
        }`}
        aria-expanded={open}
      >
        <span aria-hidden>{icon}</span>
        {current.label}
        <span className="text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <ul className="absolute right-0 z-20 mt-2 min-w-60 overflow-hidden rounded-xl bg-slate-900 py-1 text-sm text-slate-100 shadow-xl">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between gap-4 px-4 py-2.5 ${item.active ? 'bg-slate-700 font-medium' : 'hover:bg-slate-800'}`}
              >
                <span>{item.label}</span>
                <span className="flex items-center gap-2 text-xs text-slate-400">
                  {item.count !== undefined && <span className="tabular-nums">{item.count}</span>}
                  {item.active && <span className="text-emerald-400">✓</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
