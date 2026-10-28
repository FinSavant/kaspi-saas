import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { LimitBanner } from '@/components/LimitBanner';
import { FeatureGate } from '@/components/FeatureGate';
import type { Billing } from '@/components/Plans';
import { Sidebar } from '@/components/Sidebar';
import { api } from '@/lib/api';

interface Shop {
  id: string;
  name: string;
}

export default async function ShopLayout({ children, params }: { children: ReactNode; params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  const [shops, me, billing] = await Promise.all([
    api<Shop[]>('/shops'),
    api<{ isAdmin: boolean; email: string | null }>('/auth/me'),
    api<Billing>('/auth/billing'),
  ]);
  if (billing.status === 'expired' && !billing.isAdmin) redirect('/expired');

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar shopId={shopId} shops={shops} isAdmin={me.isAdmin} email={me.email} features={billing.features} />
      <main className="min-w-0 flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-10">
        <LimitBanner b={billing} shopId={shopId} />
        <FeatureGate shopId={shopId} features={billing.features}>
          {children}
        </FeatureGate>
      </main>
    </div>
  );
}
