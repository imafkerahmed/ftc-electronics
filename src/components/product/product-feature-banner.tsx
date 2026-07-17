'use client';

import React from 'react';
import Image from 'next/image';
import { ShieldCheck, Truck, Sparkles, Award, Zap, CreditCard } from 'lucide-react';

interface ProductFeatureBannerProps {
  bannerImage?: string;
  bannerText?: string;
  productName: string;
  brandName: string;
}

export default function ProductFeatureBanner({
  bannerImage,
  bannerText,
  productName,
  brandName,
}: ProductFeatureBannerProps) {
  if (!bannerImage) return null;

  return (
    <section className="my-12 w-full">
      <div className="relative w-full rounded-2xl md:rounded-3xl overflow-hidden border border-neutral-200/90 dark:border-neutral-800 bg-neutral-900 shadow-xl group">
        <div className="relative min-h-[220px] sm:min-h-[300px] lg:min-h-[360px] w-full flex items-center p-6 sm:p-10 lg:p-14">
          <Image
            src={bannerImage}
            alt={`${productName} Feature Banner`}
            fill
            className="object-cover object-center group-hover:scale-105 transition-transform duration-700 opacity-80"
            priority={false}
          />
          {/* Dark Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent z-10" />

          <div className="relative z-20 max-w-xl text-white space-y-3 sm:space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold uppercase tracking-wider">
              <Sparkles className="h-3 w-3" />
              Featured Highlight
            </span>
            <h2 className="text-xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white leading-tight">
              {bannerText || `Experience ${productName} by ${brandName}`}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-300 font-medium line-clamp-2">
              Engineered for maximum efficiency, premium build quality, and unmatched performance. Backed by official FTC Electronics warranty.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
