import Link from 'next/link';
import { NewShopForm } from '../ShopForms';

export default function NewShopPage() {
  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 py-8">
      <Link href="/" className="text-sm text-slate-500 hover:underline">
        ← К магазинам
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Подключить магазин</h1>
      <p className="text-sm text-slate-600">
        После подключения заказы за год загрузятся сами (несколько минут), дальше — раз в 5 минут.
      </p>
      <NewShopForm />
    </div>
  );
}
