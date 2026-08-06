'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X, Star, ArrowRight } from 'lucide-react';
import { Product } from '@/types/product';
import { formatPrice } from '@/lib/utils';
import AddToCartButton from '@/components/product/add-to-cart-button';
import WhatsAppOrderButton from '@/components/product/whatsapp-order-button';

interface QuickViewModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickViewModal({ product, isOpen, onClose }: QuickViewModalProps) {
  const [selectedImageOverride, setSelectedImageOverride] = useState<string | null>(null);
  const selectedImage = selectedImageOverride ?? product?.images?.[0] ?? '';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !product) return null;

  const hasDiscount = product.discountPrice !== undefined && product.discountPrice < product.price;
  const activePrice = product.discountPrice || product.price;
  const currency = product.currency || 'LKR';
  const installmentAmount = Math.round(activePrice / 3);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl bg-card border border-border p-6 sm:p-8 shadow-2xl transition-all">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900/60 border border-border text-foreground hover:bg-neutral-800 transition-colors"
          aria-label="Close modal"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Gallery Column */}
          <div className="space-y-4">
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-neutral-900/50 border border-border/80">
              <Image
                src={selectedImage || product.images[0]}
                alt={product.name}
                fill
                className="object-cover object-center"
              />
            </div>

            {/* Thumbnail Strip */}
            {product.images.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {product.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImageOverride(img)}
                    className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border transition-all ${
                      selectedImage === img
                        ? 'border-blue-500 ring-2 ring-blue-500/30'
                        : 'border-border/80 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Image src={img} alt={`Thumbnail ${idx + 1}`} fill className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details Column */}
          <div className="flex flex-col space-y-5">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-500">
                {product.brand} • {product.category}
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-foreground leading-tight mt-1">
                {product.name}
              </h2>

              {/* Rating */}
              <div className="mt-2 flex items-center gap-2">
                <div className="flex text-amber-400">
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
                <span className="text-xs text-muted-foreground">({product.numReviews} reviews)</span>
              </div>

              {/* Price & Installment */}
              <div className="mt-4 flex flex-col gap-1.5">
                {hasDiscount ? (
                  <>
                    <span className="text-2xl font-black text-foreground">
                      {formatPrice(activePrice, currency)}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground line-through">
                      {formatPrice(product.price, currency)}
                    </span>
                  </>
                ) : (
                  <span className="text-2xl font-black text-foreground">
                    {formatPrice(activePrice, currency)}
                  </span>
                )}

                <div className="text-[11px] text-muted-foreground font-medium border border-border/60 bg-card/50 px-3 py-1.5 rounded-xl max-w-fit">
                  <span>or 3x </span>
                  <strong className="text-foreground">{formatPrice(installmentAmount, currency)}</strong>
                  <span> with Koko / Mintpay</span>
                </div>
              </div>
            </div>

            {/* Short Description */}
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {product.description}
            </p>

            {/* Specifications Summary */}
            {product.specs && Object.keys(product.specs).length > 0 && (
              <div className="border-t border-border/60 pt-3 text-xs space-y-1.5">
                <h4 className="font-bold text-foreground uppercase tracking-wider text-[10px]">Key Specs</h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {Object.entries(product.specs).slice(0, 4).map(([key, val]) => (
                    <div key={key} className="flex flex-col bg-background/50 p-2 rounded-lg border border-border/50">
                      <span className="text-muted-foreground text-[9px] uppercase">{key}</span>
                      <span className="font-semibold text-foreground truncate">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTAs */}
            <div className="border-t border-border/60 pt-4 space-y-3">
              <AddToCartButton product={product} />
              <WhatsAppOrderButton productName={product.name} productPrice={formatPrice(activePrice, currency)} />
              
              <Link
                href={`/products/${product.slug}`}
                onClick={onClose}
                className="flex items-center justify-center gap-1.5 w-full text-xs font-bold text-blue-500 hover:text-blue-400 py-2 transition-colors uppercase tracking-wider"
              >
                <span>View Full Details & Specifications</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
