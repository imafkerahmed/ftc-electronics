import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { getProducts, getBrandBySlug } from "@/lib/db";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import BrandClient from "./brand-client";

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ brand: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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
    openGraph: { title, description, url, type: "website", siteName: "FTC Electronics" },
  };
}

export default async function BrandPage({ params }: PageProps) {
  const { brand: brandSlug } = await params;
  const brand = await getBrandBySlug(brandSlug);

  const displayName = brand ? brand.name : brandSlug.replace(/-/g, " ");
  // Supabase filters by brand_id (UUID), so pass brand.id instead of name
  const products = brand ? await getProducts({ brand: brand.id }) : [];

  const breadcrumbs = [
    { name: "Home", url: "https://ftc-electronics.vercel.app" },
    { name: "Brands", url: "https://ftc-electronics.vercel.app/products" },
    { name: displayName, url: `https://ftc-electronics.vercel.app/brands/${brandSlug}` },
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

      {/* Brand Store Banner */}
      <div className="relative mb-6 sm:mb-8 rounded-2xl border border-border/50 bg-card shadow-sm overflow-hidden">
        <div className="flex flex-row items-stretch gap-0">
          {brand?.logo ? (
            <div className="w-24 sm:w-56 md:w-64 lg:w-72 shrink-0 bg-muted/30 border-r border-border/40 flex items-center justify-center p-3 sm:p-8 min-h-[90px] sm:min-h-[160px]">
              <div className="relative w-full" style={{ aspectRatio: "3/2" }}>
                <Image
                  src={brand.logo}
                  alt={`${displayName} logo`}
                  fill
                  sizes="(min-width: 1024px) 288px, (min-width: 640px) 224px, 96px"
                  unoptimized={brand.logo.startsWith("http")}
                  className="object-contain"
                  priority
                />
              </div>
            </div>
          ) : (
            <div className="w-24 sm:w-56 md:w-64 shrink-0 bg-muted/30 border-r border-border/40 flex items-center justify-center p-3 sm:p-8 min-h-[90px] sm:min-h-[160px]">
              <div className="text-4xl font-black text-foreground/20 uppercase tracking-widest">
                {displayName.charAt(0)}
              </div>
            </div>
          )}

          <div className="flex flex-col justify-center gap-1.5 p-3 sm:p-6 md:p-8 flex-1">
            <h1 className="text-base sm:text-2xl md:text-3xl font-black tracking-tight text-foreground capitalize leading-tight">
              {displayName} Storefront
            </h1>
            <p className="text-[11px] sm:text-sm text-muted-foreground font-medium leading-snug max-w-lg line-clamp-3 sm:line-clamp-none">
              {brand?.description || "Discover premium hardware with guaranteed performance, curated details, and exclusive checkout options."}
            </p>
          </div>
        </div>
      </div>

      {/* Live-updating product grid via TanStack Query */}
      <BrandClient
        brandSlug={brandSlug}
        initialProducts={products}
        initialBrand={brand}
      />
    </div>
  );
}
