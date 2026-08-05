"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, useInView } from "motion/react";
import { Product } from "@/types/product";
import CollectionProductCard from "./collection-product-card";

interface CollectionSectionProps {
  title: string;
  subtitle?: string;
  badgeBgColor?: string;
  seeAllLink?: string;
  layout: "carousel" | "grid" | "flash-sale" | "featured-grid";
  products: Product[];
  rows?: number;
  mobileRows?: number;
  limit?: number;
  description?: string;
  titleColor?: string;
  brandLogo?: string;
}

export default function CollectionSection({
  title,
  seeAllLink = "/products",
  layout,
  products,
  rows,
  mobileRows,
  limit,
  description,
  titleColor,
  brandLogo,
}: CollectionSectionProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.1 });

  const [extractedColor, setExtractedColor] = useState<string | null>(null);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

  // Calculate mobile products display limit based on mobileRows setting (2 products per grid row on mobile)
  const mobileMaxCount = mobileRows && mobileRows > 0 ? mobileRows * 2 : undefined;

  useEffect(() => {
    if (!brandLogo) {
      setExtractedColor(null);
      return;
    }

    const img = new window.Image();
    img.crossOrigin = "Anonymous";
    img.src = brandLogo;
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = 30;
        canvas.height = 30;
        ctx.drawImage(img, 0, 0, 30, 30);

        const imgData = ctx.getImageData(0, 0, 30, 30).data;
        
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        let bestColor = "";
        let maxSat = 0;

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          if (a < 150) continue;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max > 0 ? (max - min) / max : 0;

          if (max < 40 || min > 220 || sat < 0.15) continue;

          rSum += r;
          gSum += g;
          bSum += b;
          count++;

          if (sat > maxSat) {
            maxSat = sat;
            bestColor = `rgb(${r}, ${g}, ${b})`;
          }
        }

        if (bestColor) {
          setExtractedColor(bestColor);
        } else if (count > 0) {
          const avgR = Math.round(rSum / count);
          const avgG = Math.round(gSum / count);
          const avgB = Math.round(bSum / count);
          setExtractedColor(`rgb(${avgR}, ${avgG}, ${avgB})`);
        } else {
          setExtractedColor(null);
        }
      } catch (err) {
        console.warn("Failed to extract dominant color from brand logo:", err);
        setExtractedColor(null);
      }
    };
  }, [brandLogo]);

  const displayLimit = rows ? rows * 5 : (limit || 5);

  // Navigation button states
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Countdown timer for Flash Sale
  const [timeLeft, setTimeLeft] = useState({
    hours: 8,
    minutes: 30,
    seconds: 0,
  });

  useEffect(() => {
    if (layout !== "flash-sale") return;

    // Set target to end of today
    const target = new Date();
    target.setHours(23, 59, 59, 999);

    const updateTimer = () => {
      const now = new Date();
      const diff = target.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [layout]);

  // Dynamic theme configurations based on collection title
  const getThemeConfig = (sectionTitle: string) => {
    const titleLower = sectionTitle.toLowerCase();
    if (titleLower.includes("sale")) {
      return {
        themeColor: "red" as const,
        accentClass: "text-red-500 dark:text-red-400",
        glowBg:
          "bg-[radial-gradient(circle_at_20%_30%,rgba(239,68,68,0.06),transparent_45%)] dark:bg-[radial-gradient(circle_at_20%_30%,rgba(239,68,68,0.11),transparent_45%)]",
        badgeBg:
          "border-red-500/20 bg-red-500/5 text-red-600 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-400",
        dotBg: "bg-red-500",
        dotPing: "bg-red-400 dark:bg-red-500",
        navHover:
          "hover:border-red-500/40 hover:text-red-500 dark:hover:border-red-400/40 dark:hover:text-red-450 hover:bg-red-500/5 dark:hover:bg-red-500/5",
        defaultSubtitle: "Limited Stocks",
      };
    } else if (titleLower.includes("new") || titleLower.includes("arrival")) {
      return {
        themeColor: "purple" as const,
        accentClass: "text-violet-500 dark:text-violet-400",
        glowBg:
          "bg-[radial-gradient(circle_at_80%_20%,rgba(139,92,246,0.05),transparent_40%)] dark:bg-[radial-gradient(circle_at_80%_20%,rgba(139,92,246,0.09),transparent_40%)]",
        badgeBg:
          "border-violet-500/20 bg-violet-500/5 text-violet-600 dark:border-violet-500/35 dark:bg-violet-500/10 dark:text-violet-400",
        dotBg: "bg-violet-500",
        dotPing: "bg-violet-400 dark:bg-violet-500",
        navHover:
          "hover:border-violet-500/40 hover:text-violet-500 dark:hover:border-violet-400/40 dark:hover:text-violet-450 hover:bg-violet-500/5 dark:hover:bg-violet-500/5",
        defaultSubtitle: "New Releases",
      };
    } else if (titleLower.includes("air") || titleLower.includes("purifier")) {
      return {
        themeColor: "teal" as const,
        accentClass: "text-teal-500 dark:text-teal-400",
        glowBg:
          "bg-[radial-gradient(circle_at_30%_60%,rgba(20,184,166,0.05),transparent_45%)] dark:bg-[radial-gradient(circle_at_30%_60%,rgba(20,184,166,0.09),transparent_45%)]",
        badgeBg:
          "border-teal-500/20 bg-teal-500/5 text-teal-600 dark:border-teal-500/35 dark:bg-teal-500/10 dark:text-teal-400",
        dotBg: "bg-teal-500",
        dotPing: "bg-teal-400 dark:bg-teal-500",
        navHover:
          "hover:border-teal-500/40 hover:text-teal-500 dark:hover:border-teal-400/40 dark:hover:text-teal-450 hover:bg-teal-500/5 dark:hover:bg-teal-500/5",
        defaultSubtitle: "Smart Climate",
      };
    }
    // Default fallback
    return {
      themeColor: "blue" as const,
      accentClass: "text-blue-600 dark:text-blue-400",
      glowBg:
        "bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.04),transparent_50%)] dark:bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.08),transparent_50%)]",
      badgeBg:
        "border-blue-500/20 bg-blue-500/5 text-blue-600 dark:border-blue-500/35 dark:bg-blue-500/10 dark:text-blue-400",
      dotBg: "bg-blue-500",
      dotPing: "bg-blue-400 dark:bg-blue-500",
      navHover:
        "hover:border-blue-500/40 hover:text-blue-500 dark:hover:border-blue-400/40 dark:hover:text-blue-450 hover:bg-blue-500/5 dark:hover:bg-blue-500/5",
      defaultSubtitle: "Curated",
    };
  };

  const config = getThemeConfig(title);

  // Check scroll positions to enable/disable arrow buttons
  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScroll);
      checkScroll();
      window.addEventListener("resize", checkScroll);
    }
    return () => {
      if (container) {
        container.removeEventListener("scroll", checkScroll);
      }
      window.removeEventListener("resize", checkScroll);
    };
  }, [products]);

  const handleScroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollAmount = container.clientWidth * 0.75;
      container.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const renderTitle = (titleText: string) => {
    const match = titleText.match(/^([^\s-]+[\s-]*)(.*)$/);
    
    let customColorStyle = {};
    let customColorClass = config.accentClass;
    
    if (extractedColor) {
      customColorStyle = { color: extractedColor };
      customColorClass = "";
    } else if (titleColor) {
      customColorStyle = { color: titleColor };
      customColorClass = "";
    }

    if (match) {
      const firstWord = match[1];
      const secondWord = match[2];
      return (
        <span>
          <span className="text-neutral-900 dark:text-neutral-50">
            {firstWord}
          </span>
          <span className={customColorClass} style={customColorStyle}>{secondWord}</span>
        </span>
      );
    }
    return <span>{titleText}</span>;
  };

  if (products.length === 0) return null;

  const isCarouselMode =
    (layout === "carousel" || layout === "flash-sale") && (!rows || rows <= 1);

  const getSectionBgClass = () => {
    return "relative bg-transparent border-b border-neutral-200/60 dark:border-neutral-800/60 py-6 sm:py-10";
  };

  return (
    <div
      ref={containerRef}
      className={`w-full relative overflow-hidden z-10 ${getSectionBgClass()}`}
    >
      {/* Aurora Glow Mesh Background */}
      {layout !== "featured-grid" && (
        <div
          className={`absolute inset-0 pointer-events-none opacity-100 transition-opacity duration-700 -z-10 ${config.glowBg}`}
        />
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-6 md:gap-8">
        {/* Unified Premium Editorial Header */}
        <motion.div
          className="w-full relative pb-4 mb-2"
          initial={{ opacity: 0, y: -12 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 sm:gap-4 border-b border-current/8 pb-3.5 sm:pb-5 relative z-10 w-full">
            <div className="flex flex-col gap-1 sm:gap-2">
              {/* Title */}
              <h2 className="text-xl sm:text-3xl lg:text-4xl font-black tracking-tight uppercase leading-none">
                {renderTitle(title)}
              </h2>
              {description && (
                <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed max-w-lg line-clamp-2">
                  {description}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 justify-between md:justify-end w-full md:w-auto mt-0.5 sm:mt-0">
              <Link href={seeAllLink} className="shrink-0">
                <button
                  className="inline-flex items-center justify-center gap-1 px-4 py-2 sm:px-5 sm:py-2.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-200"
                  aria-label="Explore Collection"
                >
                  <span>Explore All</span>
                  <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 stroke-[2.5]" />
                </button>
              </Link>

              {isCarouselMode && (
                /* Navigation Arrows */
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleScroll("left")}
                    disabled={!canScrollLeft}
                    className={`h-8.5 w-8.5 rounded-full border flex items-center justify-center transition-all duration-300 cursor-pointer backdrop-blur-xs shadow-xs ${
                      canScrollLeft
                        ? `border-neutral-300/85 bg-white/40 text-neutral-800 dark:border-neutral-700/80 dark:bg-neutral-900/40 dark:text-neutral-200 hover:scale-105 active:scale-95 ${config.navHover}`
                        : "border-neutral-200 dark:border-neutral-800 text-neutral-300 dark:text-neutral-700 opacity-40 cursor-not-allowed"
                    }`}
                    aria-label="Scroll left"
                  >
                    <ChevronLeft className="h-4.5 w-4.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScroll("right")}
                    disabled={!canScrollRight}
                    className={`h-8.5 w-8.5 rounded-full border flex items-center justify-center transition-all duration-300 cursor-pointer backdrop-blur-xs shadow-xs ${
                      canScrollRight
                        ? `border-neutral-300/85 bg-white/40 text-neutral-800 dark:border-neutral-700/80 dark:bg-neutral-900/40 dark:text-neutral-200 hover:scale-105 active:scale-95 ${config.navHover}`
                        : "border-neutral-200 dark:border-neutral-800 text-neutral-300 dark:text-neutral-700 opacity-40 cursor-not-allowed"
                    }`}
                    aria-label="Scroll right"
                  >
                    <ChevronRight className="h-4.5 w-4.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Products Display (Full Width) */}
        <div className="w-full">
          {layout === "grid" ? (
            /* Grid Display */
            <motion.div
              className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-8"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {products.map((product, idx) => (
                <CollectionProductCard
                  key={product.id || idx}
                  product={product}
                  themeColor={config.themeColor}
                />
              ))}
            </motion.div>
          ) : (layout === "featured-grid" || (rows && rows > 1)) ? (
            /* Integrated Bento Grid Layout simplified to pure grid */
            <>
              <motion.div
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-4 items-stretch"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                {/* Grid of Product Cards */}
                {products.slice(0, displayLimit).map((product, idx) => {
                  const isHiddenOnMobile =
                    mobileMaxCount && idx >= mobileMaxCount && !isMobileExpanded;
                  return (
                    <div
                      key={product.id || idx}
                      className={
                        isHiddenOnMobile ? "hidden sm:block h-full" : "block h-full"
                      }
                    >
                      <CollectionProductCard
                        product={product}
                        themeColor={config.themeColor}
                      />
                    </div>
                  );
                })}
              </motion.div>

              {mobileMaxCount &&
                products.length > mobileMaxCount &&
                !isMobileExpanded && (
                  <div className="mt-4 flex justify-center sm:hidden">
                    <button
                      type="button"
                      onClick={() => setIsMobileExpanded(true)}
                      className="inline-flex items-center gap-2 rounded-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-5 py-2.5 text-xs font-bold text-neutral-800 dark:text-neutral-200 shadow-xs transition-transform active:scale-95 cursor-pointer"
                    >
                      Show More Products ({products.length - mobileMaxCount} more)
                    </button>
                  </div>
                )}
            </>
          ) : (
            /* Carousel Display with 1 row scrolling horizontally (Supports flash-sale promo card injections) */
            <div className="relative w-full">
              <motion.div
                ref={scrollContainerRef}
                className="flex gap-3.5 sm:gap-4 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-4 pt-1 touch-pan-x"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                {/* Countdown Timer Promo Card for Flash Sale */}
                {layout === "flash-sale" && (
                  <div className="w-[200px] sm:w-[260px] lg:w-[300px] shrink-0 snap-start flex flex-col justify-between p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-red-600 via-pink-600 to-red-700 text-white shadow-lg relative overflow-hidden group select-none border border-red-500/20">
                    {/* Floating ambient blobs */}
                    <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-white/10 blur-xl group-hover:scale-125 transition-transform duration-500" />

                    <div className="flex flex-col gap-2 relative z-10">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 border border-white/20 text-[10px] font-bold tracking-widest uppercase w-fit animate-pulse">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                        Flash Deal
                      </div>
                      <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-tight mt-2">
                        TODAY{"'"}S SPECIALS
                      </h3>
                      <p className="text-xs text-white/80 leading-relaxed font-medium">
                        Exclusive discounts on premium hardware. Don{"'"}t miss
                        out!
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 mt-6 relative z-10">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                        Offer Ends In:
                      </span>

                      {/* Countdown Timer */}
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-center justify-center h-12 w-12 rounded-lg bg-white/15 backdrop-blur-sm border border-white/10">
                          <span className="text-lg font-black leading-none">
                            {String(timeLeft.hours).padStart(2, "0")}
                          </span>
                          <span className="text-[8px] font-bold uppercase tracking-widest text-white/50 mt-1">
                            HR
                          </span>
                        </div>
                        <span className="text-lg font-black text-white/40 leading-none">
                          :
                        </span>
                        <div className="flex flex-col items-center justify-center h-12 w-12 rounded-lg bg-white/15 backdrop-blur-sm border border-white/10">
                          <span className="text-lg font-black leading-none">
                            {String(timeLeft.minutes).padStart(2, "0")}
                          </span>
                          <span className="text-[8px] font-bold uppercase tracking-widest text-white/50 mt-1">
                            MIN
                          </span>
                        </div>
                        <span className="text-lg font-black text-white/40 leading-none">
                          :
                        </span>
                        <div className="flex flex-col items-center justify-center h-12 w-12 rounded-lg bg-white/15 backdrop-blur-sm border border-white/10">
                          <span className="text-lg font-black leading-none">
                            {String(timeLeft.seconds).padStart(2, "0")}
                          </span>
                          <span className="text-[8px] font-bold uppercase tracking-widest text-white/50 mt-1">
                            SEC
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Rest of the product cards */}
                {products.map((product, idx) => (
                  <div
                    key={product.id || idx}
                    className="w-[180px] sm:w-[calc((100%-32px)/3)] md:w-[calc((100%-48px)/4)] lg:w-[calc((100%-64px)/5)] shrink-0 snap-start h-full"
                  >
                    <CollectionProductCard
                      product={product}
                      themeColor={config.themeColor}
                    />
                  </div>
                ))}
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
