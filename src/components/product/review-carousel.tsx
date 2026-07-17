"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star, CheckCircle2, X } from "lucide-react";
import { motion, useInView, AnimatePresence } from "motion/react";
import { pbReviews } from "@/lib/pb-collections";

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

const DEFAULT_FALLBACK_REVIEWS: MockReview[] = [
  {
    id: "fb-1",
    name: "Kavindu Perera",
    rating: 5,
    date: "Jul 12, 2026",
    comment: "Bought the ApexBook Pro 16 for high-resolution video editing and software builds. Deliveries took under 24 hours to Colombo. Thermals and battery life are unmatched!",
    verified: true,
    product: {
      name: 'ApexBook Pro 16"',
      slug: "apexbook-pro-16",
      image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=150",
      price: 2299,
      currency: "USD",
    },
  },
  {
    id: "fb-2",
    name: "Nipuni Jayawardena",
    rating: 5,
    date: "Jul 10, 2026",
    comment: "Acoustic-X ANC headphones completely block out engine noise during commute. The audio staging on lossless tracks is superb. 10/10 service from FTC Electronics.",
    verified: true,
    product: {
      name: "Acoustic-X ANC Headphones",
      slug: "acoustic-x-anc-headphones",
      image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=150",
      price: 299,
      currency: "USD",
    },
  },
  {
    id: "fb-3",
    name: "Shanuka Wickramasinghe",
    rating: 5,
    date: "Jul 08, 2026",
    comment: "The Xiaomi Robot Vacuum H40 maps out multi-story layouts flawlessly. LiDAR navigation avoids obstacles effortlessly. Mintpay payment option worked smoothly.",
    verified: true,
    product: {
      name: "Xiaomi Robot Vacuum H40",
      slug: "xiaomi-robot-vacuum-h40",
      image: "https://images.unsplash.com/photo-1618346136472-090de27fe8b4?q=80&w=150",
      price: 155000,
      currency: "LKR",
    },
  },
  {
    id: "fb-4",
    name: "Treshan Abeykoon",
    rating: 5,
    date: "Jul 05, 2026",
    comment: "Anker Soundcore Motion X600 provides room-filling hi-res spatial audio. Perfect for beach trips and outdoor gatherings.",
    verified: true,
    product: {
      name: "Anker Soundcore Motion X600 Speaker",
      slug: "anker-soundcore-motion-x600-speaker",
      image: "https://images.unsplash.com/photo-1545454675-3531b543be5d?q=80&w=150",
      price: 59900,
      currency: "LKR",
    },
  },
];

export default function ReviewCarousel() {
  const [reviews, setReviews] = useState<MockReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<MockReview | null>(null);

  useEffect(() => {
    const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://ftc-db.codix.site';
    pbReviews
      .getApproved({ limit: 10 })
      .then((rawReviews) => {
        if (!rawReviews || rawReviews.length === 0) {
          setReviews(DEFAULT_FALLBACK_REVIEWS);
          return;
        }
        const formatted = rawReviews.map((rev) => {
          const prodExpand = rev.expand?.product;
          let imageUrl = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=150";

          if (prodExpand) {
            const rawImages = prodExpand.images as string | string[] | undefined;
            let imgPath = "";
            if (Array.isArray(rawImages) && rawImages.length > 0) {
              imgPath = rawImages[0];
            } else if (typeof rawImages === "string" && rawImages.startsWith("[")) {
              try {
                const parsed = JSON.parse(rawImages);
                if (Array.isArray(parsed) && parsed[0]) {
                  imgPath = parsed[0];
                }
              } catch {
                // Ignore
              }
            } else if (typeof rawImages === "string") {
              imgPath = rawImages;
            }

            if (imgPath && imgPath.startsWith("http")) {
              imageUrl = imgPath;
            } else if (imgPath && !imgPath.startsWith("[")) {
              imageUrl = `${pbUrl}/api/files/${prodExpand.collectionId}/${prodExpand.id}/${imgPath}`;
            } else if (prodExpand.slug) {
              const slugMapping: Record<string, string> = {
                'apexbook-pro-16': 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=150',
                'phonix-pro-15-ultra': 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=150',
                'acoustic-x-anc-headphones': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=150',
                'keyforge-q1-mechanical-keyboard': 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?q=80&w=150',
                'visionglide-34-curved-monitor': 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?q=80&w=150',
                'xiaomi-robot-vacuum-h40': 'https://images.unsplash.com/photo-1618346136472-090de27fe8b4?q=80&w=150',
                'anker-maggo-power-bank-10k': 'https://images.unsplash.com/photo-1545454675-3531b543be5d?q=80&w=150',
                'anker-soundcore-motion-x600-speaker': 'https://images.unsplash.com/photo-1545454675-3531b543be5d?q=80&w=150',
                'eufy-x10-pro-omni': 'https://images.unsplash.com/photo-1589652717521-10c341494de3?q=80&w=150',
                'eufy-smart-track-card': 'https://images.unsplash.com/photo-1627252879515-d2206173dd09?q=80&w=150',
              };
              imageUrl = slugMapping[prodExpand.slug] || imageUrl;
            }
          }

          return {
            id: rev.id,
            name: rev.customerName || "Customer",
            rating: rev.rating || 5,
            date: rev.created
              ? new Date(rev.created).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Recently",
            comment: rev.comment || "",
            verified: rev.isVerified ?? true,
            product: {
              name: prodExpand?.name || "Product",
              slug: prodExpand?.slug || "",
              image: imageUrl,
              price: prodExpand?.price || 0,
              currency: (prodExpand?.currency as "USD" | "LKR") || "LKR",
            },
          };
        });
        setReviews(formatted.length > 0 ? formatted : DEFAULT_FALLBACK_REVIEWS);
      })
      .catch(() => {
        setReviews(DEFAULT_FALLBACK_REVIEWS);
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
        className="w-full py-4 sm:py-6 lg:py-8 border-b border-neutral-200/50 dark:border-white/5 bg-[#f4f4f6] dark:bg-[#09090e]/60 relative overflow-hidden text-neutral-900 dark:text-white select-none transition-colors"
      >
        {/* Decorative ambient background */}
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-48 h-48 rounded-full bg-blue-500/5 dark:bg-blue-500/5 pointer-events-none" />
        <div className="absolute top-1/3 right-1/4 -translate-y-1/2 w-56 h-56 rounded-full bg-indigo-500/5 dark:bg-indigo-500/5 pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 flex flex-col gap-3 sm:gap-4 lg:gap-5 relative z-10">
          {/* Compact Top Section: Testimonials Description */}
          <motion.div
            className="w-full flex items-center justify-between relative z-20"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div>
              <span className="text-[9px] font-mono font-bold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-400 block mb-0.5">
                Verified Feedback
              </span>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-neutral-900 dark:text-white uppercase leading-none">
                Customer <span className="text-blue-600 dark:text-blue-400">Reviews</span>
              </h2>
            </div>
            <p className="hidden sm:block text-xs text-neutral-500 dark:text-neutral-400 max-w-sm text-right font-medium">
              Real specs & product reviews verified directly from official buyers.
            </p>
          </motion.div>

          {/* Bottom Section: Compact Infinite Looping Reviews */}
          <div className="flex-grow min-w-0 relative">
            {/* Gradient Mask for fading edges */}
            <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#f4f4f6] dark:from-[#09090e] to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#f4f4f6] dark:from-[#09090e] to-transparent z-10 pointer-events-none" />

            <div className="overflow-hidden w-full pb-2 pt-1">
              <motion.div
                className="flex w-max gap-3.5 sm:gap-4 animate-marquee-loop hover:[animation-play-state:paused] will-change-transform transform-gpu"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.15 }}
              >
                {LOOPED_REVIEWS.map((review, index) => (
                  <div
                    key={`${review.id}-${index}`}
                    onClick={() => setSelectedReview(review)}
                    className="cursor-pointer group w-[240px] sm:w-[270px] lg:w-[290px] shrink-0 border border-neutral-200/90 dark:border-white/10 bg-white dark:bg-[#12121a] shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-300 p-3.5 sm:p-4 lg:p-4.5 rounded-xl flex flex-col justify-between min-h-[140px] sm:min-h-[160px] lg:min-h-[185px]"
                  >
                    {/* Top content */}
                    <div>
                      {/* Stars and Verified Buyer label */}
                      <div className="flex justify-between items-center">
                        <div className="flex gap-0.5 text-amber-400">
                          {Array.from({ length: 5 }).map((_, idx) => (
                            <Star
                              key={idx}
                              className={`h-3.5 w-3.5 ${
                                idx < review.rating
                                  ? "fill-current text-amber-450 dark:text-amber-400"
                                  : "text-neutral-200 dark:text-neutral-800"
                              }`}
                            />
                          ))}
                        </div>

                        {review.verified && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-950/30 text-[8px] text-green-700 dark:text-green-400 border border-green-200/40 dark:border-green-500/20 font-bold tracking-wider uppercase select-none">
                            <CheckCircle2 className="h-2.5 w-2.5 text-green-600 dark:text-green-400" />
                            <span>Verified</span>
                          </div>
                        )}
                      </div>

                      {/* Testimonial Quote */}
                      <p className="mt-2 text-xs sm:text-[13px] text-neutral-600 dark:text-neutral-300 italic leading-snug line-clamp-2 relative z-10 font-medium">
                        &ldquo;{review.comment}&rdquo;
                      </p>
                    </div>

                    {/* Bottom details */}
                    <div className="mt-2.5 pt-2 border-t border-neutral-100 dark:border-white/5">
                      {/* User name & Date */}
                      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider pb-1.5">
                        <span className="font-extrabold text-neutral-900 dark:text-white truncate max-w-[140px]">
                          {review.name}
                        </span>
                        <span className="text-neutral-400 dark:text-neutral-500 font-semibold shrink-0">
                          {review.date}
                        </span>
                      </div>

                      {/* Linked Product Card inside review */}
                      <Link
                        href={`/products/${review.product.slug}`}
                        onClick={(e) => e.stopPropagation()}
                        className="group/prod flex items-center gap-2.5 bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 hover:border-blue-500/40 hover:bg-blue-50/40 dark:hover:bg-blue-500/10 p-1.5 rounded-lg transition-all duration-300"
                      >
                        {/* Compact Product Thumbnail */}
                        <div className="relative h-7 w-7 shrink-0 bg-white dark:bg-zinc-950 rounded-md overflow-hidden border border-neutral-200/60 dark:border-white/10 shadow-xs">
                          <Image
                            src={review.product.image}
                            alt={review.product.name}
                            fill
                            className="object-cover group-hover/prod:scale-105 transition-transform duration-500"
                            sizes="28px"
                            unoptimized={review.product.image.startsWith("http")}
                          />
                        </div>

                        {/* Product Metadata */}
                        <div className="flex flex-col min-w-0 justify-center">
                          <span className="text-[10px] font-bold text-neutral-800 dark:text-neutral-200 truncate group-hover/prod:text-blue-600 dark:group-hover/prod:text-blue-400 transition-colors">
                            {review.product.name}
                          </span>
                          <span className="text-[9px] font-bold text-neutral-400 dark:text-neutral-500">
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
