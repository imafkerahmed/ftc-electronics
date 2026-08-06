import { Suspense } from "react";
import CollectionSection from "@/components/product/collection-section";
import LazyScrollSection from "@/components/layout/lazy-scroll-section";
import {
  pbProducts,
  pbBrands,
} from "@/lib/pb-collections";

interface ProductCarouselBlockProps {
  block: {
    id: string;
    title?: string;
    config?: {
      source?: string;
      layout?: string;
      rows?: number;
      mobileRows?: number;
      limit?: number | string;
      description?: string;
      titleColor?: string;
      value?: string;
      brand?: string;
      category?: string;
      seeAllLink?: string;
    };
  };
  allCategories: any[];
  allBrands: any[];
  pbUrl: string;
}

// Skeleton shown while the product carousel is streaming in
function ProductCarouselSkeleton() {
  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8">
      <div className="h-7 w-48 rounded-lg bg-slate-200 dark:bg-neutral-800 animate-pulse mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-slate-200 dark:bg-neutral-800 animate-pulse aspect-[3/4]" />
        ))}
      </div>
    </div>
  );
}

async function ProductCarouselFetcher({
  block,
  allCategories,
  allBrands,
  pbUrl,
}: ProductCarouselBlockProps) {
  const source = block.config?.source || "newest";
  const configuredRows = block.config?.rows ? Number(block.config.rows) : undefined;
  const limit = configuredRows
    ? configuredRows * 5
    : parseInt(String(block.config?.limit ?? "8")) || 8;

  let products: any[] = [];

  try {
    if (source === "on-sale") {
      products = await pbProducts.getByCollection("on-sale", limit);
    } else if (source === "newest") {
      products = await pbProducts.getByCollection("new-arrivals", limit);
    } else if (source === "featured") {
      products = await pbProducts.getByCollection("featured", limit);
    } else if (source === "limited-stock") {
      const res = await pbProducts
        .getAll({ perPage: limit * 2 })
        .catch(() => ({ items: [] }));
      products = (res.items || [])
        .filter((p: any) => {
          const qty = p.countInStock ?? p.stock ?? 0;
          return qty > 0 && qty <= 10;
        })
        .slice(0, limit);
    } else if (source === "category") {
      const categorySlug = block.config?.value || block.config?.category;
      const categoryRecord = allCategories.find(
        (c: any) =>
          c.slug === categorySlug || c.id === categorySlug || c.name === categorySlug,
      );
      if (categoryRecord) {
        const res = await pbProducts.getAll({ category: categoryRecord.name, perPage: limit });
        products = res.items;
      }
    } else if (source === "brand") {
      const brandSlug = block.config?.value || block.config?.brand;
      const brandRecord = allBrands.find(
        (b: any) =>
          b.slug === brandSlug || b.id === brandSlug || b.name === brandSlug,
      );
      if (brandRecord) {
        const res = await pbProducts.getAll({ brand: brandRecord.name, perPage: limit });
        products = res.items;
      }
    }

    // Supplement with all products if fewer than requested
    if (!products || products.length < limit) {
      const fallbackRes = await pbProducts
        .getAll({ perPage: limit })
        .catch(() => ({ items: [] }));
      const existingIds = new Set((products || []).map((p: any) => p.id));
      const extraItems = (fallbackRes.items || []).filter(
        (p: any) => !existingIds.has(p.id),
      );
      products = [...(products || []), ...extraItems].slice(0, limit);
    }
  } catch (err) {
    console.error(`Failed to load products for block ${block.title}:`, err);
  }

  const seeAllLink =
    block.config?.seeAllLink ||
    (source === "on-sale"
      ? "/products?filter=on-sale"
      : source === "newest"
        ? "/products?sortBy=newest"
        : "/products");

  let brandLogoUrl: string | undefined = undefined;
  if (source === "brand") {
    const brandSlug = block.config?.value || block.config?.brand;
    const brandRecord = allBrands.find(
      (b: any) =>
        b.slug === brandSlug || b.id === brandSlug || b.name === brandSlug,
    );
    if (brandRecord?.logo) {
      brandLogoUrl = `${pbUrl}/api/files/${brandRecord.collectionId}/${brandRecord.id}/${brandRecord.logo}`;
    }
  }

  return (
    <LazyScrollSection heightClass="min-h-[500px]">
      <CollectionSection
        title={block.title || "Products"}
        layout={(block.config?.layout as any) || "featured-grid"}
        products={products}
        seeAllLink={seeAllLink}
        rows={block.config?.rows ? Number(block.config.rows) : undefined}
        mobileRows={block.config?.mobileRows ? Number(block.config.mobileRows) : 2}
        limit={block.config?.limit ? Number(block.config.limit) : undefined}
        description={block.config?.description}
        brandLogo={brandLogoUrl}
        titleColor={block.config?.titleColor}
      />
    </LazyScrollSection>
  );
}

/**
 * Streams a product carousel block independently using React Suspense.
 * The page shell (hero, banners, etc.) renders immediately while each
 * carousel fetches and renders its own products in parallel.
 */
export default function ProductCarouselBlock(props: ProductCarouselBlockProps) {
  return (
    <Suspense fallback={<ProductCarouselSkeleton />}>
      <ProductCarouselFetcher {...props} />
    </Suspense>
  );
}
