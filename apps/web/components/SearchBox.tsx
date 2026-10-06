'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

/** Поиск как в Okto: пишешь — список фильтруется сам (параметр ?q= в адресе, с паузой 300 мс). */
export function SearchBox({ placeholder = 'Поиск по товарам' }: { placeholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const current = params.get('q') ?? '';
    if (value.trim() === current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set('q', value.trim());
      else next.delete('q');
      startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
    }, 300);
    return () => clearTimeout(timer);
  }, [value, params, pathname, router]);

  return (
    <label className="relative block w-full max-w-sm">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" aria-hidden>
        {pending ? '…' : '🔍'}
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-full border border-slate-300 bg-white py-2 pr-4 pl-10 text-sm shadow-sm outline-none focus:border-slate-500"
      />
    </label>
  );
}
