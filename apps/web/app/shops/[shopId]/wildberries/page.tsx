import { redirect } from 'next/navigation';

/** Старый адрес раздела Wildberries. */
export default async function OldWildberriesUrl({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  redirect(`/shops/${shopId}/wb/reports`);
}
