import { ProductsScreen, type ProductsPageProps } from '../products/ProductsScreen';

export const dynamic = 'force-dynamic';

/** «Робот цен»: та же таблица, что «Товары», с колонками для демпинга. */
export default function RobotPage(props: ProductsPageProps) {
  return <ProductsScreen view="robot" {...props} />;
}
