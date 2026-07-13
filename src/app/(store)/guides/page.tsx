import { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, Calendar, ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Sri Lanka Electronics Buying Guides & Specs | FTC Electronics',
  description: 'Expert buying guides, laptop comparisons, and smartphone specs recommendations tailored for Sri Lankan buyers.',
  alternates: { canonical: 'https://ftc-electronics.vercel.app/guides' },
};

const guides = [
  {
    slug: 'best-laptops-under-200k-sri-lanka',
    title: 'Best Laptops in Sri Lanka Under LKR 200,000 (2026 Guide)',
    excerpt: 'Looking for high-performance laptops for university, coding, or office work? Here are our top budget-to-midrange picks backed by official Sri Lankan warranty.',
    date: 'July 10, 2026',
    category: 'Laptops',
  },
  {
    slug: 'koko-mintpay-installment-buying-guide',
    title: 'How to Buy Laptops & Phones in 0% Interest Installments via Koko & Mintpay',
    excerpt: 'Step-by-step guide on using your Sri Lankan debit card to split electronics purchases into 3 interest-free monthly payments.',
    date: 'July 05, 2026',
    category: 'Payment Guides',
  },
  {
    slug: 'mechanical-keyboards-guide-sri-lanka',
    title: 'Mechanical Keyboard Switch Guide: Linear vs Tactile vs Clicky',
    excerpt: 'Everything you need to know before buying your first custom or wireless mechanical keyboard from Keychron or Anker.',
    date: 'June 28, 2026',
    category: 'Accessories',
  },
];

export default function GuidesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 text-foreground">
      <div className="relative mb-12 rounded-3xl overflow-hidden bg-card border border-border px-6 py-10 sm:px-10">
        <div className="mb-4 h-[3px] w-12 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400" />
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider mb-3">
          <BookOpen className="h-4 w-4" /> Tech Knowledge Hub
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground mb-2">
          Buying Guides & Tech Articles
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
          Expert recommendations, spec breakdowns, and buying advice tailored for tech shoppers in Sri Lanka.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {guides.map((guide) => (
          <Link
            key={guide.slug}
            href={`/guides/${guide.slug}`}
            className="group flex flex-col justify-between p-6 rounded-2xl bg-card border border-border/70 hover:border-blue-500/40 hover:shadow-xl transition-all duration-300"
          >
            <div>
              <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-3">
                <span className="font-bold uppercase tracking-wider text-blue-500">{guide.category}</span>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{guide.date}</span>
                </div>
              </div>

              <h3 className="text-base font-bold text-foreground group-hover:text-blue-500 transition-colors leading-snug mb-2">
                {guide.title}
              </h3>

              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                {guide.excerpt}
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between text-xs font-bold text-blue-500 group-hover:text-blue-400">
              <span>Read Full Guide</span>
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
