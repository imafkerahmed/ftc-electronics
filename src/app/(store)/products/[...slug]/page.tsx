import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Star, ShieldCheck, Truck, RotateCcw, ArrowLeft } from 'lucide-react';
import { getProductBySlug, getProducts, getCategories, getCategoryBySlug } from '@/lib/db';
import AddToCartButton from '@/components/product/add-to-cart-button';
import ProductGallery from '@/components/product/product-gallery';
import ProductTabs from '@/components/product/product-tabs';
import ProductCard from '@/components/product/product-card';
import WhatsAppOrderButton from '@/components/product/whatsapp-order-button';
import { formatPrice } from '@/lib/utils';
import { ProductJsonLd, BreadcrumbJsonLd } from '@/components/seo/json-ld';
import StickyBuyBar from '@/components/product/sticky-buy-bar';
import RecentlyViewed from '@/components/product/recently-viewed';
import ProductFeatureBanner from '@/components/product/product-feature-banner';

interface PageProps {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateStaticParams() {
  const [products, categories] = await Promise.all([
    getProducts({ perPage: 200 }),
    getCategories(),
  ]);

  const productParams = products.map((p) => ({ slug: [p.slug] }));
  const categoryParams = categories.filter(c => c.isActive !== false).map((c) => ({
    slug: [c.slug || c.name.toLowerCase().replace(/\s+/g, '-')],
  }));

  return [...productParams, ...categoryParams];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: slugSegments } = await params;
  if (!slugSegments || slugSegments.length === 0) return {};

  const fullSlug = slugSegments.join('/');
  const primarySlug = slugSegments[0];

  // 1. Try resolving as Product Page
  if (slugSegments.length === 1) {
    const product = await getProductBySlug(primarySlug);
    if (product) {
      const activePrice = product.discountPrice || product.price;
      const formattedPrice = formatPrice(activePrice, product.currency || 'LKR');
      const title = `${product.name} - Buy Online in Sri Lanka | FTC Electronics`;
      const description = `Buy ${product.name} (${product.brand}) for ${formattedPrice} at FTC Electronics Sri Lanka. Official warranty, fast delivery, and 0% installments via Koko & Mintpay.`;
      const url = `https://ftc-electronics.vercel.app/products/${fullSlug}`;
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
  }

  // 2. Try resolving as Category / Subcategory PLP Page
  const category = await getCategoryBySlug(primarySlug);
  const displayName = category ? category.name : primarySlug.replace(/-/g, ' ');

  if (slugSegments.length === 2) {
    const subName = slugSegments[1].replace(/-/g, ' ');
    const title = `${subName} ${displayName} in Sri Lanka | FTC Electronics`;
    const description = `Shop authentic ${subName} ${displayName.toLowerCase()} in Sri Lanka. Official warranty, fast islandwide delivery, and 0% interest installments with FTC Electronics.`;
    const url = `https://ftc-electronics.vercel.app/products/${fullSlug}`;

    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { title, description, url, type: 'website', siteName: 'FTC Electronics' },
    };
  }

  const title = `${displayName} in Sri Lanka | FTC Electronics`;
  const description = `Shop authentic ${displayName.toLowerCase()} in Sri Lanka at FTC Electronics. 100% official warranty, islandwide fast delivery, and 0% interest 3-month installments with Koko & Mintpay.`;
  const url = `https://ftc-electronics.vercel.app/products/${primarySlug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', siteName: 'FTC Electronics' },
  };
}

export default async function DynamicProductOrCategoryPage({ params, searchParams }: PageProps) {
  const { slug: slugSegments } = await params;
  if (!slugSegments || slugSegments.length === 0) {
    notFound();
  }

  const primarySlug = slugSegments[0];

  // ─── 1. Check if single segment matches a Product Slug ───
  if (slugSegments.length === 1) {
    const product = await getProductBySlug(primarySlug);
    if (product) {
      // Render Product Detail Page (PDP)
      const hasDiscount = product.discountPrice !== undefined && product.discountPrice < product.price;
      const discountPercent = hasDiscount && product.discountPrice !== undefined
        ? Math.round(((product.price - product.discountPrice) / product.price) * 100)
        : 0;

      const currency = product.currency || 'USD';
      const activePrice = product.discountPrice || product.price;

      const instalmentAmount = activePrice / 3;
      const formattedInstalment = formatPrice(instalmentAmount, currency);

      const allCategoryProducts = await getProducts({ category: product.category });
      const relatedProducts = allCategoryProducts
        .filter((p) => p.id !== product.id)
        .slice(0, 4);

      const categorySlug = product.category.toLowerCase().replace(/\s+/g, '-');
      const pdpUrl = `https://ftc-electronics.vercel.app/products/${primarySlug}`;

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
            {/* Gallery */}
            <div className="lg:col-span-6 xl:col-span-6 flex justify-center">
              <div className="w-full lg:sticky lg:top-24">
                <ProductGallery images={product.images} name={product.name} />
              </div>
            </div>

            {/* Product Meta */}
            <div className="flex flex-col space-y-5 lg:col-span-6 xl:col-span-6 max-w-lg">
              <div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-foreground leading-tight">
                  {product.name}
                </h1>

                <div className="mt-3 flex items-center gap-2">
                  <div className="flex text-amber-500">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star
                        key={idx}
                        className={`h-3.5 w-3.5 ${idx < Math.floor(product.rating) ? 'fill-current' : 'text-muted-foreground/30'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-foreground">{product.rating}</span>
                  <span className="text-xs text-muted-foreground">({product.numReviews} customer reviews)</span>
                </div>

                {/* Stock Tracker */}
                <div className="mt-4 flex items-center gap-2">
                  {product.countInStock === 0 ? (
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground bg-neutral-900 border border-border px-2.5 py-1 rounded-lg">
                      Out of Stock
                    </div>
                  ) : product.countInStock <= 5 ? (
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-500 bg-rose-955/15 border border-rose-500/25 px-2.5 py-1 rounded-lg animate-pulse">
                      Only {product.countInStock} items left in stock - order soon!
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500 bg-emerald-955/15 border border-emerald-500/25 px-2.5 py-1 rounded-lg">
                      In Stock (Ready to Ship)
                    </div>
                  )}
                </div>

                {/* Pricing */}
                <div className="mt-6 flex flex-col gap-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                    {hasDiscount ? (
                      <>
                        <span className="text-3xl font-black text-foreground whitespace-nowrap">
                          {formatPrice(product.discountPrice!, currency)}
                        </span>
                        <span className="text-xs font-bold text-emerald-500 bg-emerald-950/10 border border-emerald-500/20 px-2 py-0.5 rounded-md whitespace-nowrap">
                          SAVE {discountPercent}%
                        </span>
                        <span className="text-sm text-muted-foreground line-through whitespace-nowrap">
                          {formatPrice(product.price, currency)}
                        </span>
                      </>
                    ) : (
                      <span className="text-3xl font-black text-foreground whitespace-nowrap">
                        {formatPrice(product.price, currency)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-border/65 pt-6 flex flex-col gap-4">
                <AddToCartButton product={product} />
                <WhatsAppOrderButton productName={product.name} productPrice={formatPrice(activePrice, currency)} />
              </div>

              <div className="grid grid-cols-3 gap-3 pt-6 border-t border-border/65 text-center">
                <div className="p-3 bg-card/30 border border-border/60 rounded-xl flex flex-col items-center justify-center hover:bg-card/50 transition-colors">
                  <ShieldCheck className="h-5 w-5 text-blue-500 mb-1.5" />
                  <span className="text-[10px] font-bold text-foreground">100% Genuine</span>
                  <span className="text-[8px] text-muted-foreground mt-0.5">Official Warranty</span>
                </div>
                <div className="p-3 bg-card/30 border border-border/60 rounded-xl flex flex-col items-center justify-center hover:bg-card/50 transition-colors">
                  <Truck className="h-5 w-5 text-blue-500 mb-1.5" />
                  <span className="text-[10px] font-bold text-foreground">Fast Delivery</span>
                  <span className="text-[8px] text-muted-foreground mt-0.5">Islandwide Shipping</span>
                </div>
                <div className="p-3 bg-card/30 border border-border/60 rounded-xl flex flex-col items-center justify-center hover:bg-card/50 transition-colors">
                  <RotateCcw className="h-5 w-5 text-blue-500 mb-1.5" />
                  <span className="text-[10px] font-bold text-foreground">Easy Returns</span>
                  <span className="text-[8px] text-muted-foreground mt-0.5">30-Day Policy</span>
                </div>
              </div>

              <div className="border-t border-border/65 pt-4 flex flex-wrap items-center gap-y-2 gap-x-4 text-[10px] text-muted-foreground font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="text-foreground/50 tracking-wider uppercase font-semibold">SKU:</span>
                  <span className="text-foreground/90 font-medium">{product.id}</span>
                </div>
                <div className="h-3 w-[1px] bg-border/80 hidden sm:block" />
                <div className="flex items-center gap-1.5">
                  <span className="text-foreground/50 tracking-wider uppercase font-semibold">Category:</span>
                  <Link href={`/products/${categorySlug}`} className="text-foreground/90 hover:text-blue-500 transition-colors font-medium capitalize">
                    {product.category}
                  </Link>
                </div>
                <div className="h-3 w-[1px] bg-border/80 hidden sm:block" />
                <div className="flex items-center gap-1.5">
                  <span className="text-foreground/50 tracking-wider uppercase font-semibold">Brand:</span>
                  <Link href={`/brands/${product.brand.toLowerCase()}`} className="text-foreground/90 hover:text-blue-500 transition-colors font-medium capitalize">
                    {product.brand}
                  </Link>
                </div>
              </div>
            </div>
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

          {/* Sticky Bottom Buy Bar on Scroll */}
          <StickyBuyBar product={product} />
        </div>
      );
    }
  }

  // ─── 2. Otherwise Render Category / Subcategory PLP Page ───
  const resolvedSearchParams = await searchParams;
  const brandParam = typeof resolvedSearchParams.brand === 'string' ? resolvedSearchParams.brand : undefined;
  const sortParam = typeof resolvedSearchParams.sort === 'string' ? resolvedSearchParams.sort : undefined;
  const searchParam = typeof resolvedSearchParams.search === 'string' ? resolvedSearchParams.search : undefined;

  const category = await getCategoryBySlug(primarySlug);
  if (category && category.isActive === false) {
    notFound();
  }
  const displayName = category ? category.name : primarySlug.replace(/-/g, ' ');

  const subName = slugSegments.length >= 2 ? slugSegments[1].replace(/-/g, ' ') : undefined;

  const products = await getProducts({
    category: displayName,
    brand: brandParam,
    search: subName || searchParam,
    sortBy: sortParam as 'price-asc' | 'price-desc' | 'rating' | 'newest',
  });

  const categoryUrl = `https://ftc-electronics.vercel.app/products/${primarySlug}`;
  const breadcrumbs = [
    { name: 'Home', url: 'https://ftc-electronics.vercel.app' },
    { name: 'Products', url: 'https://ftc-electronics.vercel.app/products' },
    { name: displayName, url: categoryUrl },
    ...(subName ? [{ name: subName, url: `${categoryUrl}/${slugSegments[1]}` }] : []),
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
        {subName ? (
          <>
            <Link href={`/products/${primarySlug}`} className="hover:text-foreground transition-colors capitalize">{displayName}</Link>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <span className="text-foreground font-medium capitalize">{subName}</span>
          </>
        ) : (
          <span className="text-foreground font-medium capitalize">{displayName}</span>
        )}
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
          {subName ? `${subName} ${displayName}` : `${displayName} Collection`}
        </h1>

        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl mt-2">
          Explore our authorized selection of genuine {subName ? `${subName} ` : ''}{displayName.toLowerCase()} in Sri Lanka.
          Enjoy official agent warranty, fast islandwide delivery, and flexible 0% interest payment options with Koko and Mintpay.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 py-3 mb-6 border-b border-border/60">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-bold text-foreground tabular-nums">{products.length}</span> products
        </p>

        {brandParam && (
          <Link
            href={`/products/${primarySlug}`}
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
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
