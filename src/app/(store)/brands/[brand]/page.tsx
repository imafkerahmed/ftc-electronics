import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { getProducts, getBrands, getBrandBySlug } from "@/lib/db";
import ProductCard from "@/components/product/product-card";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

interface PageProps {
  params: Promise<{ brand: string }>;
}

export async function generateStaticParams() {
  const brands = await getBrands();
  return brands.map((b) => ({
    brand: b.slug || b.name.toLowerCase().replace(/\s+/g, "-"),
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { brand: brandSlug } = await params;
  const brand = await getBrandBySlug(brandSlug);

  const displayName = brand ? brand.name : brandSlug.replace(/-/g, " ");
  const title = `Official ${displayName} Store in Sri Lanka | FTC Electronics`;
  const description = `Buy 100% genuine ${displayName} laptops, phones, and devices in Sri Lanka with official warranty, fast delivery, and 0% interest installments at FTC Electronics.`;
  const url = `https://ftc-electronics.vercel.app/brands/${brandSlug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      siteName: "FTC Electronics",
    },
  };
}

export default async function BrandPage({ params }: PageProps) {
  const { brand: brandSlug } = await params;
  const brand = await getBrandBySlug(brandSlug);

  const displayName = brand ? brand.name : brandSlug.replace(/-/g, " ");
  const products = await getProducts({ brand: displayName });

  const breadcrumbs = [
    { name: "Home", url: "https://ftc-electronics.vercel.app" },
    { name: "Brands", url: "https://ftc-electronics.vercel.app/products" },
    {
      name: displayName,
      url: `https://ftc-electronics.vercel.app/brands/${brandSlug}`,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
      <BreadcrumbJsonLd items={breadcrumbs} />

      {/* Breadcrumbs */}
      <nav className="flex items-center space-x-2 text-xs text-muted-foreground mb-6 overflow-x-auto whitespace-nowrap pb-1">
        <Link href="/" className="hover:text-foreground transition-colors">
          Home
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <Link
          href="/products"
          className="hover:text-foreground transition-colors"
        >
          Products
        </Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="text-foreground font-medium capitalize">
          {displayName}
        </span>
      </nav>

      {/* Brand Store Banner */}
      <div className="relative mb-8 rounded-2xl overflow-hidden bg-gradient-to-br from-card via-card to-blue-955/30 border border-border px-6 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.3)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.3)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
        <div className="pointer-events-none absolute -top-12 -right-12 h-56 w-56 rounded-full bg-blue-500/15 blur-3xl" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground capitalize mb-2">
              {displayName} Storefront
            </h1>

            <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed max-w-lg">
              {brand?.description ||
                "Discover premium hardware with guaranteed performance, curated details, and exclusive checkout options."}
            </p>
          </div>

          {brand?.logo && (
            <div className="h-24 w-44 relative shrink-0 flex items-center justify-center">
              <Image
                src={brand.logo}
                alt={`${displayName} logo`}
                fill
                className="object-contain"
              />
            </div>
          )}
        </div>
      </div>

      {/* Product Grid */}
      <div className="flex items-center justify-between gap-4 py-3 mb-6 border-b border-border/60">
        <p className="text-sm text-muted-foreground">
          Showing{" "}
          <span className="font-bold text-foreground tabular-nums">
            {products.length}
          </span>{" "}
          products from{" "}
          <span className="capitalize font-semibold text-foreground">
            {displayName}
          </span>
        </p>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center border border-dashed border-border rounded-2xl bg-card/30">
          <h3 className="text-lg font-black text-foreground mb-2">
            No {displayName} products listed
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Explore our full product catalog for available devices.
          </p>
          <Link
            href="/products"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl px-6 py-3.5 transition-colors"
          >
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
