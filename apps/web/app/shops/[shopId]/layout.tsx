import type { ReactNode } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';

interface Shop {
  id: string;
  name: string;
}

export default async function ShopLayout({ children, params }: { children: ReactNode; params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const shops = await api<Shop[]>('/shops');

  return (
    <div className="flex min-h-screen">
      <Sidebar shopId={shopId} shops={shops} />
      <main className="min-w-0 flex-1 px-6 py-6 lg:px-10">{children}</main>
    </div>
  );
}
