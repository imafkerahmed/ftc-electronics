"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, CheckCircle2, X } from "lucide-react";
import { motion, useInView, AnimatePresence } from "motion/react";

interface MockReview {
  id: string;
  name: string;
  rating: number;
  date: string;
  comment: string;
  verified: boolean;
  product: {
    name: string;
    slug: string;
    image: string;
    price: number;
    currency: "USD" | "LKR";
  };
}

import { pbReviews } from "@/lib/pb-collections";

export default function ReviewCarousel() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.1 });

  const [reviews, setReviews] = useState<MockReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<MockReview | null>(null);

  useEffect(() => {
    const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site';
    pbReviews.getApproved({ limit: 10 }).then((rawReviews) => {
      if (!rawReviews || rawReviews.length === 0) return;
      const formatted = rawReviews.map((rev) => {
        const prodExpand = rev.expand?.product;
        let imageUrl = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=150";
        if (prodExpand?.images?.[0]) {
          imageUrl = `${pbUrl}/api/files/${prodExpand.collectionId}/${prodExpand.id}/${prodExpand.images[0]}`;
        } else if (prodExpand?.slug) {
          const slugMapping: Record<string, string> = {
            'apexbook-pro-16': 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=150',
            'phonix-pro-15-ultra': 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=150',
            'acoustic-x-anc-headphones': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=150',
            'keyforge-q1-mechanical-keyboard': 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?q=80&w=150',
            'visionglide-34-curved-monitor': 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=150',
            'xiaomi-robot-vacuum-h40': 'https://images.unsplash.com/photo-1618346136472-090de27fe8b4?q=80&w=150',
            'anker-maggo-power-bank-10k': 'https://images.unsplash.com/photo-1609592424109-dd9f565d71c3?q=80&w=150',
            'eufy-x10-pro-omni': 'https://images.unsplash.com/photo-1589652717521-10c341494de3?q=80&w=150',
            'eufy-smart-track-card': 'https://images.unsplash.com/photo-1627252879515-d2206173dd09?q=80&w=150',
            'xiaomi-ballpoint-pen-white': 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?q=80&w=150',
            'xiaomi-color-gel-pen-5pack': 'https://images.unsplash.com/photo-1511556532299-8f662fc26c06?q=80&w=150',
            'wiwu-skin-armor-laptop-sleeve': 'https://images.unsplash.com/photo-1625766763788-95dcce9bf5ac?q=80&w=150',
            'wiwu-skin-zero-sleeve': 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?q=80&w=150',
            'wiwu-minimalis-travel-pouch': 'https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?q=80&w=150',
            'xiaomi-uniblade-trimmer-head': 'https://images.unsplash.com/photo-1621607512214-68297480165e?q=80&w=150',
            'xiaomi-water-flosser-tips': 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?q=80&w=150',
            'xiaomi-dust-mite-filter-2pack': 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?q=80&w=150',
            'xiaomi-smart-air-purifier-6': 'https://images.unsplash.com/photo-1585338107529-13afc5f02586?q=80&w=150',
            'dyson-hushjet-purifier-hj10': 'https://images.unsplash.com/photo-1595246140625-573b715d11dc?q=80&w=150',
            'dyson-purifier-cool-tp12': 'https://images.unsplash.com/photo-1614292244591-6c5c3c84e1b5?q=80&w=150',
            'xiaomi-smart-pet-care-air-purifier': 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?q=80&w=150',
            'ivon-dual-port-fast-charger': 'https://images.unsplash.com/photo-1622445262465-2481c4574875?q=80&w=150',
            'ivon-braided-usb-c-cable': 'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?q=80&w=150',
            'ivon-true-wireless-anc-earbuds': 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?q=80&w=150',
          };
          imageUrl = slugMapping[prodExpand.slug] || imageUrl;
        }

        return {
          id: rev.id,
          name: rev.customerName,
          rating: rev.rating,
          date: new Date(rev.created).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          comment: rev.comment,
          verified: rev.isVerified,
          product: {
            name: prodExpand?.name || "Product",
            slug: prodExpand?.slug || "",
            image: imageUrl,
            price: prodExpand?.price || 0,
            currency: (prodExpand?.currency as "USD" | "LKR") || "LKR",
          },
        };
      });
      setReviews(formatted);
    });
  }, []);

  useEffect(() => {
    if (selectedReview) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [selectedReview]);

  if (reviews.length === 0) return null;

  // Duplicate reviews to create an infinite seamless loop
  const LOOPED_REVIEWS = [...reviews, ...reviews];

  const formatPriceVal = (value: number, currency: "USD" | "LKR") => {
    if (currency === "LKR") {
      return `Rs.${value.toLocaleString("en-US")}`;
    }
    return `$${value.toFixed(2)}`;
  };

  return (
    <>
      <div
        ref={sectionRef}
        className="w-full py-8 sm:py-12 lg:py-16 border-b border-neutral-200/50 dark:border-white/5 bg-[#f4f4f6] dark:bg-[#09090e]/60 relative overflow-hidden text-neutral-900 dark:text-white select-none transition-colors"
      >
        <style
          dangerouslySetInnerHTML={{
            __html: `
          @keyframes marquee {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .animate-marquee {
            animation: marquee 40s linear infinite;
          }
        `,
          }}
        />

        {/* Decorative ambient blobs in the background */}
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-64 h-64 rounded-full bg-blue-500/5 dark:bg-blue-500/[0.02] blur-[80px] pointer-events-none" />
        <div className="absolute top-1/3 right-1/4 -translate-y-1/2 w-80 h-80 rounded-full bg-indigo-500/5 dark:bg-indigo-500/[0.02] blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 flex flex-col gap-5 sm:gap-8 lg:gap-12 relative z-10">
          {/* Top Section: Testimonials Description */}
          <motion.div
            className="w-full flex flex-col items-center justify-center text-center relative z-20"
            initial={{ opacity: 0, y: -20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-neutral-900 dark:text-white uppercase leading-none">
              Customer <span className="text-blue-600 dark:text-blue-400">Reviews</span>
            </h2>

            <p className="mt-2.5 sm:mt-4 lg:mt-5 text-sm sm:text-base text-neutral-500 dark:text-neutral-400 leading-relaxed max-w-xl mx-auto font-medium">
              Real reviews and specs verified by verified purchasers. Sourced
              directly from our official channels.
            </p>
          </motion.div>

          {/* Bottom Section: Infinite Looping Reviews */}
          <div className="flex-grow min-w-0 relative">
            {/* Gradient Mask for fading edges */}
            <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#f4f4f6] dark:from-[#09090e] to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#f4f4f6] dark:from-[#09090e] to-transparent z-10 pointer-events-none" />

            <div className="overflow-hidden w-full pb-6 pt-2">
              <motion.div
                className="flex w-max gap-4 sm:gap-5 animate-marquee hover:[animation-play-state:paused]"
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                {LOOPED_REVIEWS.map((review, index) => (
                  <div
                    key={`${review.id}-${index}`}
                    onClick={() => setSelectedReview(review)}
                    className="cursor-pointer group w-[280px] sm:w-[340px] lg:w-[380px] shrink-0 border border-neutral-200/50 dark:border-white/5 bg-white/75 dark:bg-zinc-900/35 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] hover:shadow-[0_12px_25px_-5px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_12px_25px_-5px_rgba(0,0,0,0.3)] hover:-translate-y-1.5 backdrop-blur-md transition-all duration-300 p-3 sm:p-6 lg:p-7 rounded-2xl flex flex-col justify-between min-h-[175px] sm:min-h-[210px] lg:min-h-[310px]"
                  >
                    {/* Top content */}
                    <div>
                      {/* Stars and Verified Buyer label */}
                      <div className="flex justify-between items-center">
                        <div className="flex gap-0.5 text-amber-400">
                          {Array.from({ length: 5 }).map((_, idx) => (
                            <Star
                              key={idx}
                              className={`h-4 w-4 ${
                                idx < review.rating
                                  ? "fill-current text-amber-450 dark:text-amber-400 drop-shadow-[0_0_4px_rgba(245,158,11,0.25)]"
                                  : "text-neutral-200 dark:text-neutral-800"
                              }`}
                            />
                          ))}
                        </div>

                        {review.verified && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-950/20 text-[9px] text-green-750 dark:text-green-400 border border-green-200/10 dark:border-green-500/10 font-bold tracking-widest uppercase select-none">
                            <CheckCircle2 className="h-3 w-3 text-green-650 dark:text-green-400" />
                            <span>Verified</span>
                          </div>
                        )}
                      </div>

                      {/* Testimonial Quote */}
                      <p className="mt-2 sm:mt-3 lg:mt-5 text-sm sm:text-[15px] text-neutral-600 dark:text-neutral-355 italic leading-relaxed line-clamp-2 lg:line-clamp-4 relative z-10 font-medium">
                        &ldquo;{review.comment}&rdquo;
                      </p>
                    </div>

                    {/* Bottom details */}
                    <div className="mt-3 sm:mt-4 lg:mt-6">
                      {/* User name & Date */}
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider border-b border-neutral-100/80 dark:border-white/5 pb-3">
                        <span className="font-extrabold text-neutral-900 dark:text-white">
                          {review.name}
                        </span>
                        <span className="text-neutral-450 dark:text-neutral-500 font-bold">
                          {review.date}
                        </span>
                      </div>

                      {/* Linked Product Card inside review */}
                      <Link
                        href={`/products/${review.product.slug}`}
                        onClick={(e) => e.stopPropagation()}
                        className="group/prod flex items-center gap-3.5 bg-neutral-50/50 dark:bg-white/[0.02] border border-neutral-200/50 dark:border-white/5 hover:border-blue-305 dark:hover:border-blue-500/30 hover:bg-blue-50/30 dark:hover:bg-blue-500/10 hover:shadow-xs p-1.5 lg:p-2.5 rounded-xl mt-2 sm:mt-3 transition-all duration-300"
                      >
                        {/* Product Thumbnail */}
                        <div className="relative h-10 w-10 shrink-0 bg-white dark:bg-zinc-950 rounded-lg overflow-hidden border border-neutral-100 dark:border-white/10 shadow-xs">
                          <Image
                            src={review.product.image}
                            alt={review.product.name}
                            fill
                            className="object-cover group-hover/prod:scale-105 transition-transform duration-500"
                            sizes="40px"
                          />
                        </div>

                        {/* Product Metadata */}
                        <div className="flex flex-col min-w-0 justify-center">
                          <span className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 truncate group-hover/prod:text-blue-600 dark:group-hover/prod:text-blue-400 transition-colors">
                            {review.product.name}
                          </span>
                          <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-450 mt-0.5">
                            {formatPriceVal(
                              review.product.price,
                              review.product.currency,
                            )}
                          </span>
                        </div>
                      </Link>
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modal Overlay */}
      <AnimatePresence>
        {selectedReview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={() => setSelectedReview(null)}
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-2xl bg-white dark:bg-[#0c0c12] border border-neutral-200/50 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10"
            >
              {/* Header with Close Button */}
              <div className="absolute top-4 right-4 z-20">
                <button
                  onClick={() => setSelectedReview(null)}
                  className="p-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-250 dark:hover:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white rounded-full transition-colors cursor-pointer"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-8 sm:p-10 overflow-y-auto">
                <div className="flex justify-between items-center mb-6 pr-12">
                  <div className="flex gap-1 text-amber-400">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star
                        key={idx}
                        className={`h-5 w-5 ${
                          idx < selectedReview.rating
                            ? "fill-current text-amber-450 dark:text-amber-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.25)]"
                            : "text-neutral-200 dark:text-neutral-850"
                        }`}
                      />
                    ))}
                  </div>
                  {selectedReview.verified && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-950/20 text-[10px] text-green-750 dark:text-green-400 border border-green-200/10 dark:border-green-500/10 font-bold tracking-widest uppercase">
                      <CheckCircle2 className="h-4 w-4 text-green-650 dark:text-green-400" />
                      <span>Verified Buyer</span>
                    </div>
                  )}
                </div>

                <p className="text-base sm:text-lg text-neutral-700 dark:text-neutral-200 italic leading-relaxed mb-8 font-medium">
                  &ldquo;{selectedReview.comment}&rdquo;
                </p>

                <div className="flex items-center justify-between text-xs sm:text-sm uppercase tracking-wider border-t border-neutral-100 dark:border-white/5 pt-6">
                  <div>
                    <span className="font-extrabold text-neutral-900 dark:text-white block mb-1">
                      {selectedReview.name}
                    </span>
                    <span className="text-neutral-450 dark:text-neutral-500 font-bold normal-case">
                      Reviewed on {selectedReview.date}
                    </span>
                  </div>
                </div>

                {/* Product Reference */}
                <div className="mt-8 pt-6 border-t border-neutral-100 dark:border-white/5">
                  <span className="text-[10px] font-extrabold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest mb-3 block">
                    Product Reviewed
                  </span>
                  <Link
                    href={`/products/${selectedReview.product.slug}`}
                    onClick={(e) => e.stopPropagation()}
                    className="group/prod flex items-center gap-4 bg-neutral-50/50 dark:bg-white/[0.02] border border-neutral-200/50 dark:border-white/5 hover:border-blue-300 dark:hover:border-blue-500/30 hover:bg-blue-50/30 dark:hover:bg-blue-500/10 p-3 rounded-2xl transition-all duration-300"
                  >
                    <div className="relative h-14 w-14 shrink-0 bg-white dark:bg-zinc-950 rounded-xl overflow-hidden border border-neutral-100 dark:border-white/10 shadow-xs">
                      <Image
                        src={selectedReview.product.image}
                        alt={selectedReview.product.name}
                        fill
                        className="object-cover group-hover/prod:scale-105 transition-transform duration-500"
                        sizes="56px"
                      />
                    </div>
                    <div className="flex flex-col min-w-0 justify-center">
                      <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200 truncate group-hover/prod:text-blue-600 dark:group-hover/prod:text-blue-400 transition-colors">
                        {selectedReview.product.name}
                      </span>
                      <span className="text-xs font-bold text-neutral-500 dark:text-neutral-450 mt-1">
                        {formatPriceVal(
                          selectedReview.product.price,
                          selectedReview.product.currency,
                        )}
                      </span>
                    </div>
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
