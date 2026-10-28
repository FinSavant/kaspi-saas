import { redirect } from 'next/navigation';

/** Раздел Wildberries открывается со списка отчётов. */
export default async function WbIndex({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  redirect(`/shops/${shopId}/wb/reports`);
}
