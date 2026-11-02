import { redirect } from 'next/navigation';

/** Вкладку «Товары/Предзаказ» убрали: всё теперь в «Робот цен». Старые ссылки ведут туда. */
export default async function ProductsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  redirect(`/shops/${shopId}/robot`);
}
