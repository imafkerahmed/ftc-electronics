import { Product } from '@/types/product';
import CollectionProductCard from './collection-product-card';

interface ProductGridProps {
  products: Product[];
}

export default function ProductGrid({ products }: ProductGridProps) {
  if (products.length === 0) {
    return null; // Empty state handled by parent
  }

  return (
    <div className="grid grid-cols-2 gap-3.5 md:grid-cols-2 lg:grid-cols-3 gap-y-5 gap-x-4 pb-8">
      {products.map((product) => (
        <CollectionProductCard key={product.id} product={product} themeColor="blue" />
      ))}
    </div>
  );
}
