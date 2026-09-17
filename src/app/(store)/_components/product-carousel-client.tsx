'use client';

import { useQuery } from '@tanstack/react-query';
import CollectionSection from '@/components/product/collection-section';
import { productKeys } from '@/lib/query-keys';

interface ProductCarouselClientProps {
  initialProducts: any[];
  title: string;
  layout: "carousel" | "grid" | "flash-sale" | "featured-grid";
  seeAllLink: string;
  rows?: number;
  mobileRows?: number;
  limit?: number;
  description?: string;
  brandLogo?: string;
  titleColor?: string;
}

export default function ProductCarouselClient({
  initialProducts,
  ...props
}: ProductCarouselClientProps) {
  // Extract IDs to batch fetch
  const ids = initialProducts.map(p => p.id).join(',');

  const { data: products = initialProducts } = useQuery({
    queryKey: [...productKeys.lists(), 'batch', ids],
    queryFn: async () => {
      if (!ids) return initialProducts;
      const res = await fetch(`/api/products/batch?ids=${ids}`);
      if (!res.ok) return initialProducts;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
      return initialProducts;
    },
    initialData: initialProducts,
    refetchOnWindowFocus: true,
    refetchInterval: 8000,
    // Only run the query if we have IDs
    enabled: !!ids,
  });

  return <CollectionSection {...props} products={products} />;
}
