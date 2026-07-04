import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Star, ShieldCheck, Truck, RotateCcw } from 'lucide-react';
import { getProductBySlug, getProducts } from '@/lib/db';
import AddToCartButton from '@/components/product/add-to-cart-button';
import ProductGallery from '@/components/product/product-gallery';
import ProductTabs from '@/components/product/product-tabs';
import ProductCard from '@/components/product/product-card';
import WhatsAppOrderButton from '@/components/product/whatsapp-order-button';
import { formatPrice } from '@/lib/utils';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const hasDiscount = product.discountPrice !== undefined;
  const discountPercent = hasDiscount && product.discountPrice !== undefined
    ? Math.round(((product.price - product.discountPrice) / product.price) * 100)
    : 0;

  const currency = product.currency || 'USD';
  const activePrice = product.discountPrice || product.price;

  // Calculate installment breakdown
  const instalmentAmount = activePrice / 3;
  const formattedInstalment = formatPrice(instalmentAmount, currency);

  // Fetch related products in the same category
  const allCategoryProducts = await getProducts({ category: product.category });
  const relatedProducts = allCategoryProducts
    .filter((p) => p.id !== product.id)
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
      {/* Breadcrumbs */}
      <nav className="flex items-center space-x-2 text-xs text-muted-foreground mb-8 overflow-x-auto whitespace-nowrap scrollbar-none pb-1 select-none">
        <Link href="/" className="hover:text-foreground transition-colors whitespace-nowrap">Home</Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <Link href="/products" className="hover:text-foreground transition-colors whitespace-nowrap">Products</Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <Link 
          href={`/products?category=${encodeURIComponent(product.category)}`} 
          className="hover:text-foreground transition-colors capitalize whitespace-nowrap"
        >
          {product.category}
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="text-foreground/90 truncate max-w-[150px] sm:max-w-none whitespace-nowrap">{product.name}</span>
      </nav>

      {/* Main product view split */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Left Side: Sticky Image Gallery */}
        <div className="md:col-span-1 lg:col-span-6 xl:col-span-7">
          <div className="lg:sticky lg:top-24">
            <ProductGallery images={product.images} name={product.name} />
          </div>
        </div>

        {/* Right Side: Product Details */}
        <div className="flex flex-col space-y-6 md:col-span-1 lg:col-span-6 xl:col-span-5">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-foreground leading-tight">
              {product.name}
            </h1>
            
            {/* Ratings Summary */}
            <div className="mt-3 flex items-center gap-2">
              <div className="flex text-amber-500">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Star
                    key={idx}
                    className={`h-3.5 w-3.5 ${
                      idx < Math.floor(product.rating) ? 'fill-current' : 'text-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs font-semibold text-foreground">{product.rating}</span>
              <span className="text-xs text-muted-foreground">({product.numReviews} customer reviews)</span>
            </div>

            {/* Stock Urgency Tracker */}
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
            
            {/* Price display */}
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                {hasDiscount && product.discountPrice !== undefined ? (
                  <>
                    <span className="text-3xl font-black text-foreground whitespace-nowrap">
                      {formatPrice(product.discountPrice, currency)}
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

              {/* Installment Pricing breakdown */}
              <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-1.5 font-medium border border-border/60 bg-card/45 px-3 py-2 rounded-xl max-w-fit shadow-xs">
                <span>or 3 interest-free payments of</span>
                <span className="font-bold text-foreground">{formattedInstalment}</span>
                <span>with</span>
                <span className="font-bold text-[#F3E8FF] bg-[#2B0F54] text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-md">Koko</span>
                <span>/</span>
                <span className="font-bold text-[#0A252E] bg-[#00D4B2] text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-md">Mintpay</span>
              </div>
            </div>
          </div>



          {/* Client Purchase Block + WhatsApp Order Button */}
          <div className="border-t border-border/65 pt-6 flex flex-col gap-4">
            <AddToCartButton product={product} />
            <WhatsAppOrderButton
              productName={product.name}
              productPrice={formatPrice(activePrice, currency)}
            />
          </div>          {/* Guarantees Row */}
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
          {/* Product Meta details */}
          <div className="border-t border-border/65 pt-4 flex flex-wrap items-center gap-y-2 gap-x-4 text-[10px] text-muted-foreground font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-foreground/50 tracking-wider uppercase font-semibold">SKU:</span>
              <span className="text-foreground/90 font-medium">{product.id}</span>
            </div>
            <div className="h-3 w-[1px] bg-border/80 hidden sm:block" />
            <div className="flex items-center gap-1.5">
              <span className="text-foreground/50 tracking-wider uppercase font-semibold">Category:</span>
              <Link href={`/products?category=${encodeURIComponent(product.category)}`} className="text-foreground/90 hover:text-blue-500 transition-colors font-medium capitalize">
                {product.category}
              </Link>
            </div>
            <div className="h-3 w-[1px] bg-border/80 hidden sm:block" />
            <div className="flex items-center gap-1.5">
              <span className="text-foreground/50 tracking-wider uppercase font-semibold">Brand:</span>
              <span className="text-foreground/90 font-medium capitalize">{product.brand}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description & Technical Specifications Tabs Component */}
      <ProductTabs 
        description={product.description} 
        specs={product.specs} 
        currency={currency} 
      />

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <div className="border-t border-border mt-20 pt-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-foreground">You May Also Like</h2>
              <p className="text-xs text-muted-foreground mt-1">Discover other premium devices in the {product.category} collection</p>
            </div>
            <Link 
              href={`/products?category=${encodeURIComponent(product.category)}`}
              className="text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors uppercase tracking-wider"
            >
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
    </div>
  );
}
