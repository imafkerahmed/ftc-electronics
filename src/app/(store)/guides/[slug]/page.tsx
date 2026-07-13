import { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Calendar, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { getProducts } from '@/lib/db';
import ProductCard from '@/components/product/product-card';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const title = slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return {
    title: `${title} | FTC Electronics Sri Lanka`,
    description: `Read our comprehensive guide on ${title}. Expert tips, Sri Lanka pricing, and authorized agent warranty details.`,
    alternates: { canonical: `https://ftc-electronics.vercel.app/guides/${slug}` },
  };
}

export default async function GuideDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const formattedTitle = slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());

  const featuredLaptops = await getProducts({ category: 'Laptops', perPage: 4 });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 text-foreground">
      <nav className="flex items-center space-x-2 text-xs text-muted-foreground mb-6 overflow-x-auto whitespace-nowrap pb-1">
        <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <Link href="/guides" className="hover:text-foreground transition-colors">Guides</Link>
        <ChevronRight className="h-3 w-3 shrink-0" />
        <span className="text-foreground font-medium truncate max-w-[200px] sm:max-w-none">{formattedTitle}</span>
      </nav>

      <div className="relative mb-8 rounded-3xl overflow-hidden bg-card border border-border p-6 sm:p-10">
        <Link
          href="/guides"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors mb-4 group uppercase tracking-widest"
        >
          <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" />
          Back to Guides
        </Link>

        <div className="flex items-center gap-2 text-xs font-mono text-blue-500 font-bold uppercase tracking-wider mb-2">
          <span>Buying Advice</span>
          <span>•</span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>Updated July 2026</span>
          </div>
        </div>

        <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground leading-tight">
          {formattedTitle}
        </h1>
      </div>

      {/* Guide Content Body */}
      <div className="prose prose-invert max-w-none space-y-6 text-sm text-muted-foreground leading-relaxed">
        <p className="text-base text-foreground/90 font-medium">
          Navigating the electronics market in Sri Lanka requires evaluating performance specs, genuine agent warranty coverage, and flexible payment plans. In this guide, we break down key purchasing considerations.
        </p>

        <h2 className="text-xl font-bold text-foreground mt-8 mb-3">Key Things to Look For</h2>
        <div className="space-y-3">
          {[
            'Official Sri Lankan Agent Warranty vs. Shop Warranty',
            'Display Quality & Color Accuracy (sRGB coverage for creators)',
            'Battery Endurance & Charging Speed',
            '0% Installment Eligibility via Koko and Mintpay',
          ].map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs text-foreground font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-bold text-foreground mt-8 mb-3">Recommended Models at FTC Electronics</h2>
        <p>Explore top-rated laptops available in our Colombo store and online with fast islandwide shipping:</p>
      </div>

      {/* Featured Product Rail */}
      <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {featuredLaptops.map((prod) => (
          <ProductCard key={prod.id} product={prod} />
        ))}
      </div>
    </div>
  );
}
