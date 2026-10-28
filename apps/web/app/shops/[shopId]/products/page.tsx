import { ProductsScreen, type ProductsPageProps } from './ProductsScreen';

export const dynamic = 'force-dynamic';

/** «Товары»: цены, склады, себестоимость и предзаказ. */
export default function ProductsPage(props: ProductsPageProps) {
  return <ProductsScreen view="products" {...props} />;
}
