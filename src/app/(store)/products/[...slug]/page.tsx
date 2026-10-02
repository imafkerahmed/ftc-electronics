import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { getProductBySlug, getProducts, getCategoryBySlug } from '@/lib/db';
import ProductGallery from '@/components/product/product-gallery';
import ProductTabs from '@/components/product/product-tabs';
import ProductCard from '@/components/product/product-card';
import { formatPrice } from '@/lib/utils';
import { ProductJsonLd, BreadcrumbJsonLd } from '@/components/seo/json-ld';
import RecentlyViewed from '@/components/product/recently-viewed';
import ProductFeatureBanner from '@/components/product/product-feature-banner';
import ProductDetailClient from './product-detail-client';

interface PageProps {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// Dynamic rendering — product prices and stock change frequently,
// so we always server-render fresh data instead of using a stale static snapshot.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: slugSegments } = await params;
  if (!slugSegments || slugSegments.length === 0) return {};

  const primarySlug = slugSegments[0];

  // 1. Single Segment Resolution
  if (slugSegments.length === 1) {
    const [product, category] = await Promise.all([
      getProductBySlug(primarySlug),
      getCategoryBySlug(primarySlug),
    ]);

    // A. Try resolving as Product Page
    if (product) {
      const activePrice = product.discountPrice || product.price;
      const formattedPrice = formatPrice(activePrice, product.currency || 'LKR');
      const title = `${product.name} - Buy Online in Sri Lanka | FTC Electronics`;
      const description = `Buy ${product.name} (${product.brand}) for ${formattedPrice} at FTC Electronics Sri Lanka. Official warranty, fast delivery, and 0% installments via Koko & Mintpay.`;
      const url = `https://ftc-electronics.vercel.app/products/${product.slug}`;
      const ogImage = product.images?.[0];

      return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: {
          title,
          description,
          url,
          siteName: 'FTC Electronics',
          images: ogImage ? [{ url: ogImage, alt: product.name }] : [],
          type: 'website',
        },
      };
    }

    // B. Try resolving as Category PLP Page
    if (category && category.isActive !== false) {
      const displayName = category.name;
      const title = `${displayName} in Sri Lanka | FTC Electronics`;
      const description = `Shop authentic ${displayName.toLowerCase()} in Sri Lanka at FTC Electronics. 100% official warranty, islandwide fast delivery, and 0% interest 3-month installments with Koko & Mintpay.`;
      const url = `https://ftc-electronics.vercel.app/products/${category.slug}`;

      return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: { title, description, url, type: 'website', siteName: 'FTC Electronics' },
      };
    }

    return {};
  }

  // 2. Two Segments Resolution
  if (slugSegments.length === 2) {
    const [category, subProduct] = await Promise.all([
      getCategoryBySlug(slugSegments[0]),
      getProductBySlug(slugSegments[1]),
    ]);

    if (category && category.isActive !== false) {
      // Check if second segment is a product inside this category
      if (subProduct) {
        const activePrice = subProduct.discountPrice || subProduct.price;
        const formattedPrice = formatPrice(activePrice, subProduct.currency || 'LKR');
        const title = `${subProduct.name} - Buy Online in Sri Lanka | FTC Electronics`;
        const description = `Buy ${subProduct.name} (${subProduct.brand}) for ${formattedPrice} at FTC Electronics Sri Lanka. Official warranty, fast delivery, and 0% installments via Koko & Mintpay.`;
        const url = `https://ftc-electronics.vercel.app/products/${subProduct.slug}`;
        const ogImage = subProduct.images?.[0];

        return {
          title,
          description,
          alternates: { canonical: url },
          openGraph: {
            title,
            description,
            url,
            siteName: 'FTC Electronics',
            images: ogImage ? [{ url: ogImage, alt: subProduct.name }] : [],
            type: 'website',
          },
        };
      }

      // Otherwise subcategory listing
      const displayName = category.name;
      const subName = decodeURIComponent(slugSegments[1]).replace(/-/g, ' ');
      const title = `${subName} ${displayName} in Sri Lanka | FTC Electronics`;
      const description = `Shop authentic ${subName} ${displayName.toLowerCase()} in Sri Lanka. Official warranty, fast islandwide delivery, and 0% interest installments with FTC Electronics.`;
      const url = `https://ftc-electronics.vercel.app/products/${category.slug}/${slugSegments[1]}`;

      return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: { title, description, url, type: 'website', siteName: 'FTC Electronics' },
      };
    }

    // Direct product lookup fallback for segment 1
    if (subProduct) {
      const activePrice = subProduct.discountPrice || subProduct.price;
      const formattedPrice = formatPrice(activePrice, subProduct.currency || 'LKR');
      const title = `${subProduct.name} - Buy Online in Sri Lanka | FTC Electronics`;
      const description = `Buy ${subProduct.name} (${subProduct.brand}) for ${formattedPrice} at FTC Electronics Sri Lanka. Official warranty, fast delivery, and 0% installments via Koko & Mintpay.`;
      const url = `https://ftc-electronics.vercel.app/products/${subProduct.slug}`;
      const ogImage = subProduct.images?.[0];

      return {
        title,
        description,
        alternates: { canonical: url },
        openGraph: {
          title,
          description,
          url,
          siteName: 'FTC Electronics',
          images: ogImage ? [{ url: ogImage, alt: subProduct.name }] : [],
          type: 'website',
        },
      };
    }

    return {};
  }

  return {};
}

export default async function DynamicProductOrCategoryPage({ params, searchParams }: PageProps) {
  const { slug: slugSegments } = await params;
  if (!slugSegments || slugSegments.length === 0 || slugSegments.length > 2) {
    notFound();
  }

  const primarySlug = slugSegments[0];

  // ─── 1. Single Segment Resolution ───
  if (slugSegments.length === 1) {
    const [product, category] = await Promise.all([
      getProductBySlug(primarySlug),
      getCategoryBySlug(primarySlug),
    ]);

    if (product) {
      // Render Product Detail Page (PDP)
      const currency = product.currency || 'LKR';
      const allCategoryProducts = await getProducts({
        categoryId: product.categoryId,
        category: product.categoryId ? undefined : product.category
      });
      const relatedProducts = allCategoryProducts
        .filter((p) => p.id !== product.id)
        .slice(0, 4);

      const categorySlug = (product.category || 'general').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '');
      const pdpUrl = `https://ftc-electronics.vercel.app/products/${product.slug}`;

      const breadcrumbs = [
        { name: 'Home', url: 'https://ftc-electronics.vercel.app' },
        { name: 'Products', url: 'https://ftc-electronics.vercel.app/products' },
        { name: product.category, url: `https://ftc-electronics.vercel.app/products/${categorySlug}` },
        { name: product.name, url: pdpUrl },
      ];

      return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
          <ProductJsonLd product={product} url={pdpUrl} />
          <BreadcrumbJsonLd items={breadcrumbs} />

          {/* Breadcrumbs */}
          <nav className="flex items-center space-x-2 text-xs text-muted-foreground mb-8 overflow-x-auto whitespace-nowrap scrollbar-none pb-1 select-none">
            <Link href="/" className="hover:text-foreground transition-colors whitespace-nowrap">Home</Link>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <Link href="/products" className="hover:text-foreground transition-colors whitespace-nowrap">Products</Link>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <Link href={`/products/${categorySlug}`} className="hover:text-foreground transition-colors capitalize whitespace-nowrap">
              {product.category}
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <span className="text-foreground/90 truncate max-w-[150px] sm:max-w-none whitespace-nowrap">{product.name}</span>
          </nav>

          {/* Main Product Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
            {/* Gallery — server rendered */}
            <div className="lg:col-span-6 xl:col-span-6 flex justify-center">
              <div className="w-full lg:sticky lg:top-24">
                <ProductGallery images={product.images} name={product.name} />
              </div>
            </div>

            {/* Product Meta — client component powered by TanStack Query */}
            <ProductDetailClient
              initialProduct={product}
              slug={product.slug}
              categorySlug={categorySlug}
            />
          </div>

          <ProductFeatureBanner
            bannerImage={product.bannerImage}
            bannerText={product.bannerText}
            productName={product.name}
            brandName={product.brand}
          />

          <ProductTabs description={product.description} specs={product.specs} currency={currency} />

          {relatedProducts.length > 0 && (
            <div className="border-t border-border mt-20 pt-16">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-foreground">You May Also Like</h2>
                  <p className="text-xs text-muted-foreground mt-1">Discover other devices in the {product.category} collection</p>
                </div>
                <Link href={`/products/${categorySlug}`} className="text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors uppercase tracking-wider">
                  See All
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {relatedProducts.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </div>
          )}

          {/* Client Recently Viewed Tracker */}
          <RecentlyViewed currentProduct={product} />
        </div>
      );
    }

    // Category Resolution
    if (!category || category.isActive === false) {
      notFound();
    }

    const resolvedSearchParams = await searchParams;
    const brandParam = typeof resolvedSearchParams.brand === 'string' ? resolvedSearchParams.brand : undefined;
    const sortParam = typeof resolvedSearchParams.sort === 'string' ? resolvedSearchParams.sort : undefined;
    const searchParam = typeof resolvedSearchParams.search === 'string' ? resolvedSearchParams.search : undefined;

    const displayName = category.name;
    const products = await getProducts({
      categoryId: category.id,
      brand: brandParam,
      search: searchParam,
      sortBy: sortParam as 'price-asc' | 'price-desc' | 'rating' | 'newest',
    });

    const categoryUrl = `https://ftc-electronics.vercel.app/products/${category.slug}`;
    const breadcrumbs = [
      { name: 'Home', url: 'https://ftc-electronics.vercel.app' },
      { name: 'Products', url: 'https://ftc-electronics.vercel.app/products' },
      { name: displayName, url: categoryUrl },
    ];

    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
        <BreadcrumbJsonLd items={breadcrumbs} />

        {/* Breadcrumbs */}
        <nav className="flex items-center space-x-2 text-xs text-muted-foreground mb-6 overflow-x-auto whitespace-nowrap pb-1">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="text-foreground font-medium capitalize">{displayName}</span>
        </nav>

        {/* Category Header */}
        <div className="relative mb-8 rounded-2xl overflow-hidden bg-card border border-border px-6 py-8 sm:px-10 sm:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.4)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.4)_1px,transparent_1px)] bg-[size:32px_32px] opacity-50" />
          <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="mb-4 h-[3px] w-12 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400" />

          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors mb-3 group uppercase tracking-widest"
          >
            <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" />
            All Products
          </Link>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground capitalize mb-2">
            {displayName} Collection
          </h1>

          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mt-2">
            Explore our authorized selection of genuine {displayName.toLowerCase()} in Sri Lanka.
            Enjoy official agent warranty, fast islandwide delivery, and flexible 0% interest payment options with Koko and Mintpay.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 py-3 mb-6 border-b border-border/60">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-bold text-foreground tabular-nums">{products.length}</span> products
          </p>

          {brandParam && (
            <Link
              href={`/products/${category.slug}`}
              className="text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors uppercase tracking-wider"
            >
              Clear Filters
            </Link>
          )}
        </div>

        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-border rounded-2xl bg-card/30">
            <h3 className="text-lg font-black text-foreground mb-2">No products found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">Explore our full product catalog.</p>
            <Link href="/products" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl px-6 py-3.5 transition-colors">
              View All Products
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── 2. Two Segments Resolution ───
  const [category, subProduct] = await Promise.all([
    getCategoryBySlug(primarySlug),
    getProductBySlug(slugSegments[1]),
  ]);

  if (category && category.isActive !== false) {
    // Check if second segment is a product
    if (subProduct) {
      const currency = subProduct.currency || 'LKR';
      const allCategoryProducts = await getProducts({
        categoryId: subProduct.categoryId,
        category: subProduct.categoryId ? undefined : subProduct.category
      });
      const relatedProducts = allCategoryProducts
        .filter((p) => p.id !== subProduct.id)
        .slice(0, 4);

      const categorySlug = category.slug;
      const pdpUrl = `https://ftc-electronics.vercel.app/products/${subProduct.slug}`;

      const breadcrumbs = [
        { name: 'Home', url: 'https://ftc-electronics.vercel.app' },
        { name: 'Products', url: 'https://ftc-electronics.vercel.app/products' },
        { name: subProduct.category, url: `https://ftc-electronics.vercel.app/products/${categorySlug}` },
        { name: subProduct.name, url: pdpUrl },
      ];

      return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
          <ProductJsonLd product={subProduct} url={pdpUrl} />
          <BreadcrumbJsonLd items={breadcrumbs} />

          <nav className="flex items-center space-x-2 text-xs text-muted-foreground mb-8 overflow-x-auto whitespace-nowrap scrollbar-none pb-1 select-none">
            <Link href="/" className="hover:text-foreground transition-colors whitespace-nowrap">Home</Link>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <Link href="/products" className="hover:text-foreground transition-colors whitespace-nowrap">Products</Link>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <Link href={`/products/${categorySlug}`} className="hover:text-foreground transition-colors capitalize whitespace-nowrap">
              {subProduct.category}
            </Link>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <span className="text-foreground/90 truncate max-w-[150px] sm:max-w-none whitespace-nowrap">{subProduct.name}</span>
          </nav>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
            <div className="lg:col-span-6 xl:col-span-6 flex justify-center">
              <div className="w-full lg:sticky lg:top-24">
                <ProductGallery images={subProduct.images} name={subProduct.name} />
              </div>
            </div>

            <ProductDetailClient
              initialProduct={subProduct}
              slug={subProduct.slug}
              categorySlug={categorySlug}
            />
          </div>

          <ProductFeatureBanner
            bannerImage={subProduct.bannerImage}
            bannerText={subProduct.bannerText}
            productName={subProduct.name}
            brandName={subProduct.brand}
          />

          <ProductTabs description={subProduct.description} specs={subProduct.specs} currency={currency} />

          {relatedProducts.length > 0 && (
            <div className="border-t border-border mt-20 pt-16">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-foreground">You May Also Like</h2>
                  <p className="text-xs text-muted-foreground mt-1">Discover other devices in the {subProduct.category} collection</p>
                </div>
                <Link href={`/products/${categorySlug}`} className="text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors uppercase tracking-wider">
                  See All
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {relatedProducts.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </div>
          )}

          <RecentlyViewed currentProduct={subProduct} />
        </div>
      );
    }

    // Render Subcategory Filter PLP
    const resolvedSearchParams = await searchParams;
    const brandParam = typeof resolvedSearchParams.brand === 'string' ? resolvedSearchParams.brand : undefined;
    const sortParam = typeof resolvedSearchParams.sort === 'string' ? resolvedSearchParams.sort : undefined;
    const searchParam = typeof resolvedSearchParams.search === 'string' ? resolvedSearchParams.search : undefined;

    const displayName = category.name;
    const subName = decodeURIComponent(slugSegments[1]).replace(/-/g, ' ');

    const products = await getProducts({
      categoryId: category.id,
      brand: brandParam,
      search: subName || searchParam,
      sortBy: sortParam as 'price-asc' | 'price-desc' | 'rating' | 'newest',
    });

    const categoryUrl = `https://ftc-electronics.vercel.app/products/${category.slug}`;
    const breadcrumbs = [
      { name: 'Home', url: 'https://ftc-electronics.vercel.app' },
      { name: 'Products', url: 'https://ftc-electronics.vercel.app/products' },
      { name: displayName, url: categoryUrl },
      { name: subName, url: `${categoryUrl}/${slugSegments[1]}` },
    ];

    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
        <BreadcrumbJsonLd items={breadcrumbs} />

        <nav className="flex items-center space-x-2 text-xs text-muted-foreground mb-6 overflow-x-auto whitespace-nowrap pb-1">
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <Link href={`/products/${category.slug}`} className="hover:text-foreground transition-colors capitalize">{displayName}</Link>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="text-foreground font-medium capitalize">{subName}</span>
        </nav>

        <div className="relative mb-8 rounded-2xl overflow-hidden bg-card border border-border px-6 py-8 sm:px-10 sm:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.4)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.4)_1px,transparent_1px)] bg-[size:32px_32px] opacity-50" />
          <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="mb-4 h-[3px] w-12 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400" />

          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors mb-3 group uppercase tracking-widest"
          >
            <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" />
            All Products
          </Link>

          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground capitalize mb-2">
            {subName} {displayName}
          </h1>

          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mt-2">
            Explore our authorized selection of genuine {subName} {displayName.toLowerCase()} in Sri Lanka.
            Enjoy official agent warranty, fast islandwide delivery, and flexible 0% interest payment options with Koko and Mintpay.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 py-3 mb-6 border-b border-border/60">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-bold text-foreground tabular-nums">{products.length}</span> products
          </p>

          {brandParam && (
            <Link
              href={`/products/${category.slug}`}
              className="text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors uppercase tracking-wider"
            >
              Clear Filters
            </Link>
          )}
        </div>

        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-border rounded-2xl bg-card/30">
            <h3 className="text-lg font-black text-foreground mb-2">No products found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">Explore our full product catalog.</p>
            <Link href="/products" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl px-6 py-3.5 transition-colors">
              View All Products
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Segment 0 was not a category; test if segment 1 is a product
  if (subProduct) {
    const currency = subProduct.currency || 'LKR';
    const allCategoryProducts = await getProducts({
      categoryId: subProduct.categoryId,
      category: subProduct.categoryId ? undefined : subProduct.category
    });
    const relatedProducts = allCategoryProducts
      .filter((p) => p.id !== subProduct.id)
      .slice(0, 4);

    const categorySlug = (subProduct.category || 'general').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '');
    const pdpUrl = `https://ftc-electronics.vercel.app/products/${subProduct.slug}`;

    const breadcrumbs = [
      { name: 'Home', url: 'https://ftc-electronics.vercel.app' },
      { name: 'Products', url: 'https://ftc-electronics.vercel.app/products' },
      { name: subProduct.category, url: `https://ftc-electronics.vercel.app/products/${categorySlug}` },
      { name: subProduct.name, url: pdpUrl },
    ];

    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
        <ProductJsonLd product={subProduct} url={pdpUrl} />
        <BreadcrumbJsonLd items={breadcrumbs} />

        <nav className="flex items-center space-x-2 text-xs text-muted-foreground mb-8 overflow-x-auto whitespace-nowrap scrollbar-none pb-1 select-none">
          <Link href="/" className="hover:text-foreground transition-colors whitespace-nowrap">Home</Link>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <Link href="/products" className="hover:text-foreground transition-colors whitespace-nowrap">Products</Link>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <Link href={`/products/${categorySlug}`} className="hover:text-foreground transition-colors capitalize whitespace-nowrap">
            {subProduct.category}
          </Link>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <span className="text-foreground/90 truncate max-w-[150px] sm:max-w-none whitespace-nowrap">{subProduct.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          <div className="lg:col-span-6 xl:col-span-6 flex justify-center">
            <div className="w-full lg:sticky lg:top-24">
              <ProductGallery images={subProduct.images} name={subProduct.name} />
            </div>
          </div>

          <ProductDetailClient
            initialProduct={subProduct}
            slug={subProduct.slug}
            categorySlug={categorySlug}
          />
        </div>

        <ProductFeatureBanner
          bannerImage={subProduct.bannerImage}
          bannerText={subProduct.bannerText}
          productName={subProduct.name}
          brandName={subProduct.brand}
        />

        <ProductTabs description={subProduct.description} specs={subProduct.specs} currency={currency} />

        {relatedProducts.length > 0 && (
          <div className="border-t border-border mt-20 pt-16">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-foreground">You May Also Like</h2>
                <p className="text-xs text-muted-foreground mt-1">Discover other devices in the {subProduct.category} collection</p>
              </div>
              <Link href={`/products/${categorySlug}`} className="text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors uppercase tracking-wider">
                See All
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}

        <RecentlyViewed currentProduct={subProduct} />
      </div>
    );
  }

  // Neither segment is a valid product or category -> notFound()
  notFound();
}
