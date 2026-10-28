import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';

/** Страницы входа и регистрации: логотип и слоган SANQ над формой. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Logo size="lg" dark />
          <div className="mt-2 text-xs font-semibold tracking-[0.3em] text-slate-400">ЦИФРЫ. АНАЛИТИКА. РОСТ.</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-xl">{children}</div>
      </div>
    </div>
  );
}
