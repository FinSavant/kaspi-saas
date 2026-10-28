import { redirect } from 'next/navigation';
import { logout } from '@/app/(auth)/actions';
import { Logo } from '@/components/Logo';
import { PlanCards, type Billing } from '@/components/Plans';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Срок тарифа истёк: кабинет закрыт, робот стоит, данные сохранены. Оплата — через WhatsApp. */
export default async function ExpiredPage() {
  const b = await api<Billing>('/auth/billing');
  if (b.isAdmin || b.status !== 'expired') redirect('/');

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <Logo />
        <form action={logout}>
          <button type="submit" className="text-sm text-slate-500 hover:text-red-600">
            Выйти
          </button>
        </form>
      </div>
      <section className="rounded-xl border border-red-200 bg-red-50 p-5">
        <h1 className="text-xl font-bold text-red-800">Обновите тариф</h1>
        <p className="mt-1 text-sm text-red-700">
          Срок доступа закончился. Робот цен и рассылка отзывов остановлены, все ваши данные сохранены. Выберите тариф и оплатите через
          WhatsApp — после оплаты кабинет откроется в течение дня.
        </p>
      </section>
      <PlanCards b={b} />
    </div>
  );
}
