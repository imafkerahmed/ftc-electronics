import { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { searchProducts } from '@/lib/db';
import ProductCard from '@/components/product/product-card';

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { q = '' } = await searchParams;
  const title = q ? `Search results for "${q}" | FTC Electronics` : 'Search Products | FTC Electronics';

  return {
    title,
    robots: { index: false, follow: true }, // Search result pages should not be indexed by search engines
  };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q = '' } = await searchParams;
  const query = q.trim();
  const products = query ? await searchProducts(query) : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
      <div className="relative mb-8 rounded-2xl overflow-hidden bg-card border border-border px-6 py-8 sm:px-10">
        <div className="flex items-center gap-3 mb-2">
          <Search className="h-6 w-6 text-blue-500" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            Search Results
          </h1>
        </div>
        {query ? (
          <p className="text-sm text-muted-foreground">
            Showing results for <span className="font-bold text-foreground">&quot;{query}&quot;</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Please enter a keyword in the search bar above to search our catalog.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between py-3 mb-6 border-b border-border/60">
        <p className="text-sm text-muted-foreground">
          Found <span className="font-bold text-foreground tabular-nums">{products.length}</span> matching products
        </p>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-border rounded-2xl bg-card/30">
          <h3 className="text-lg font-black text-foreground mb-2">
            {query ? `No products matching "${query}"` : 'Search FTC Electronics'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Try checking for spelling errors, using more general keywords, or browsing by category.
          </p>
          <Link
            href="/products"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl px-6 py-3.5 transition-colors"
          >
            Browse Catalog
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
