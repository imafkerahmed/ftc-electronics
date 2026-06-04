import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, ShieldCheck, Truck, RotateCcw } from 'lucide-react';
import { getProductBySlug } from '@/lib/db';
import AddToCartButton from '@/components/product/add-to-cart-button';

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
      {/* Breadcrumbs */}
      <nav className="flex items-center space-x-2 text-xs text-muted-foreground mb-8">
        <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground/90 truncate">{product.name}</span>
      </nav>

      {/* Main product view split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        {/* Left Side: Images */}
        <div className="relative overflow-hidden rounded-xl border border-border bg-card aspect-square w-full">
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority={true}
          />
        </div>

        {/* Right Side: Product Details */}
        <div className="flex flex-col space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{product.brand}</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground mt-1">{product.name}</h1>
            
            {/* Price display */}
            <div className="mt-4 flex items-baseline gap-3">
              {hasDiscount ? (
                <>
                  <span className="text-2xl font-black text-foreground">${product.discountPrice}</span>
                  <span className="text-sm text-muted-foreground line-through">${product.price}</span>
                </>
              ) : (
                <span className="text-2xl font-black text-foreground">${product.price}</span>
              )}
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-foreground/90">Description</h3>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{product.description}</p>
          </div>

          {/* Client Interaction (Quantity selector + Add to cart button) */}
          <div className="border-t border-border pt-6">
            <AddToCartButton product={product} />
          </div>

          {/* Trust points */}
          <div className="border-t border-border pt-6 grid grid-cols-3 gap-4 text-center">
            <div className="flex flex-col items-center p-3 bg-card border border-border rounded-lg">
              <Truck className="h-5 w-5 text-blue-500 mb-2" />
              <span className="text-[10px] font-semibold text-foreground">Free Shipping</span>
              <span className="text-[9px] text-muted-foreground mt-0.5">Orders over $500</span>
            </div>
            <div className="flex flex-col items-center p-3 bg-card border border-border rounded-lg">
              <RotateCcw className="h-5 w-5 text-blue-500 mb-2" />
              <span className="text-[10px] font-semibold text-foreground">30-Day Return</span>
              <span className="text-[9px] text-muted-foreground mt-0.5">100% money back</span>
            </div>
            <div className="flex flex-col items-center p-3 bg-card border border-border rounded-lg">
              <ShieldCheck className="h-5 w-5 text-blue-500 mb-2" />
              <span className="text-[10px] font-semibold text-foreground">2 Year Warranty</span>
              <span className="text-[9px] text-muted-foreground mt-0.5">Brand protection</span>
            </div>
          </div>
        </div>
      </div>

      {/* Specifications specs Section */}
      <div className="border-t border-border mt-16 pt-12">
        <h2 className="text-xl font-bold tracking-wide text-foreground mb-6">Technical Specifications</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 max-w-4xl">
          {Object.entries(product.specs).map(([key, val]) => (
            <div key={key} className="flex justify-between border-b border-border py-3 text-sm">
              <span className="text-muted-foreground font-medium">{key}</span>
              <span className="text-foreground/90 font-semibold">{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
