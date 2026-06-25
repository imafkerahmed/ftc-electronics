"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Sparkles, Flame, Wind, Zap } from "lucide-react";
import { motion, useInView } from "motion/react";
import { Product } from "@/types/product";
import CollectionProductCard from "./collection-product-card";
import GradientTextComponent from "@/components/ui/GradientText/GradientText";

const GradientText = GradientTextComponent as React.ComponentType<{
  children: React.ReactNode;
  className?: string;
  colors?: string[];
  animationSpeed?: number;
  showBorder?: boolean;
  direction?: "horizontal" | "vertical" | "diagonal";
  pauseOnHover?: boolean;
  yoyo?: boolean;
}>;

interface CollectionSectionProps {
  title: string;
  subtitle?: string;
  badgeBgColor?: string;
  seeAllLink?: string;
  layout: "carousel" | "grid" | "flash-sale" | "featured-grid";
  products: Product[];
}



export default function CollectionSection({
  title,
  subtitle,
  badgeBgColor = "bg-[#ff0000]",
  seeAllLink = "/products",
  layout,
  products,
}: CollectionSectionProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.1 });

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
    if (match) {
      const firstWord = match[1];
      const secondWord = match[2];
      return (
        <span>
          <span className="text-neutral-900 dark:text-neutral-50">
            {firstWord}
          </span>
          <span className={config.accentClass}>{secondWord}</span>
        </span>
      );
    }
    return <span>{titleText}</span>;
  };

  if (products.length === 0) return null;

  const isCarouselMode = layout === "carousel" || layout === "flash-sale";

  const getSectionBgClass = () => {
    if (layout !== "featured-grid") return "bg-transparent py-2 sm:py-3";
    switch (config.themeColor) {
      case "purple":
        return "bg-violet-50/50 dark:bg-violet-950/10 border-y border-violet-100 dark:border-violet-900/20 py-6 sm:py-8";
      case "red":
        return "bg-red-50/50 dark:bg-red-950/10 border-y border-red-100 dark:border-red-900/20 py-6 sm:py-8";
      case "teal":
        return "bg-teal-50/50 dark:bg-teal-950/10 border-y border-teal-100 dark:border-teal-900/20 py-6 sm:py-8";
      case "blue":
      default:
        return "bg-blue-50/50 dark:bg-blue-950/10 border-y border-blue-100 dark:border-blue-900/20 py-6 sm:py-8";
    }
  };

  return (
    <div
      ref={containerRef}
      className={`w-full relative overflow-hidden z-10 ${getSectionBgClass()}`}
    >
      {/* Aurora Glow Mesh Background */}
      <div
        className={`absolute inset-0 pointer-events-none opacity-100 transition-opacity duration-700 -z-10 ${config.glowBg}`}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-6 md:gap-8">
        {/* Header containing Title on left, and Controls on right */}
        {layout !== "featured-grid" && (
          <motion.div
            className="w-full flex items-center justify-between"
            initial={{ opacity: 0, y: -10 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {/* Section Main Title aligned left */}
            <h2 className="text-xl sm:text-2xl lg:text-3.5xl font-black tracking-tight uppercase leading-none text-left">
              {renderTitle(title)}
            </h2>

            <div className="flex items-center gap-4 shrink-0">
              {/* See All link */}
              <Link
                href={seeAllLink}
                className="group flex items-center text-xs font-semibold text-neutral-455 hover:text-blue-650 dark:hover:text-blue-400 transition-colors duration-200"
              >
                <span>See All</span>
                <ChevronRight className="h-3.5 w-3.5 ml-0.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>

              {isCarouselMode && (
                /* Navigation Arrows */
                <div className="flex items-center gap-2">
                  <button
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
          </motion.div>
        )}

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
          ) : layout === "featured-grid" ? (
            /* Asymmetric Featured Bento Grid Layout */
            <motion.div
              className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {/* Left Side Campaign Banner Card */}
              <div className={`lg:col-span-3 flex flex-col justify-between items-center p-5 sm:p-6 rounded-xl transition-all duration-300 hover:-translate-y-1 z-10 relative overflow-hidden group select-none min-h-[300px] lg:min-h-full py-8 ${
                config.themeColor === "purple" ? "bg-violet-100/35 dark:bg-violet-950/15 border border-violet-200/50 dark:border-violet-900/30 hover:border-violet-500/35 hover:shadow-[0_10px_20px_rgba(139,92,246,0.04)]" :
                config.themeColor === "red" ? "bg-red-100/35 dark:bg-red-950/15 border border-red-200/50 dark:border-red-900/30 hover:border-red-500/35 hover:shadow-[0_10px_20px_rgba(239,68,68,0.04)]" :
                config.themeColor === "teal" ? "bg-teal-100/35 dark:bg-teal-950/15 border border-teal-200/50 dark:border-teal-900/30 hover:border-teal-500/35 hover:shadow-[0_10px_20px_rgba(20,184,166,0.04)]" :
                "bg-blue-100/35 dark:bg-blue-950/15 border border-blue-200/50 dark:border-blue-900/30 hover:border-blue-500/35 hover:shadow-[0_10px_20px_rgba(59,130,246,0.04)]"
              }`}>
                
                {/* Background light glow matching the product card subtle hover glows */}
                <motion.div 
                  className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full blur-[60px] pointer-events-none -z-10 ${
                    config.themeColor === "purple" ? "bg-violet-500/10 dark:bg-violet-500/5" :
                    config.themeColor === "red" ? "bg-red-500/10 dark:bg-red-500/5" :
                    config.themeColor === "teal" ? "bg-teal-500/10 dark:bg-teal-500/5" :
                    "bg-blue-500/10 dark:bg-blue-500/5"
                  }`}
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.6, 0.9, 0.6]
                  }}
                  transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />

                {/* Center Title (Rotated -90 degrees, flows bottom-to-top) */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <motion.h3 
                    className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-[0.25em] font-sans leading-none whitespace-nowrap -rotate-90"
                    animate={{
                      scale: [0.98, 1.02, 0.98]
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  >
                    <GradientText
                      colors={
                        config.themeColor === "purple" ? ["#a855f7", "#ec4899", "#6366f1", "#a855f7"] :
                        config.themeColor === "red" ? ["#ef4444", "#f97316", "#e11d48", "#ef4444"] :
                        config.themeColor === "teal" ? ["#14b8a6", "#06b6d4", "#10b981", "#14b8a6"] :
                        ["#3b82f6", "#06b6d4", "#2563eb", "#3b82f6"]
                      }
                      animationSpeed={6}
                      showBorder={false}
                      className="!p-0 !m-0 !cursor-default !bg-transparent !rounded-none !overflow-visible border-none select-none font-black"
                    >
                      {title}
                    </GradientText>
                  </motion.h3>
                </div>

                {/* Bottom CTA Button */}
                <Link href={seeAllLink} className="relative z-10 mt-2 block">
                  <motion.button 
                    initial="initial"
                    whileHover="hover"
                    className="group relative inline-flex items-center gap-1.5 pb-1 focus:outline-none cursor-pointer text-[10px] font-black uppercase tracking-widest text-neutral-850 dark:text-neutral-200 transition-colors duration-300 select-none"
                    whileTap={{ scale: 0.98 }}
                    aria-label="Explore Collection"
                  >
                    <span>Explore Now</span>
                    <motion.span
                      variants={{
                        initial: { x: 0 },
                        hover: { x: 3 }
                      }}
                      transition={{ type: "spring", stiffness: 400, damping: 12 }}
                    >
                      <ChevronRight className={`h-3.5 w-3.5 stroke-[3] transition-colors duration-300 ${
                        config.themeColor === "purple" ? "text-violet-500" :
                        config.themeColor === "red" ? "text-red-500" :
                        config.themeColor === "teal" ? "text-teal-550" :
                        "text-blue-500"
                      }`} />
                    </motion.span>
                    
                    {/* Interactive expanding underline */}
                    <motion.span 
                      className={`absolute bottom-0 left-0 h-[2px] rounded-full ${
                        config.themeColor === "purple" ? "bg-violet-500" :
                        config.themeColor === "red" ? "bg-red-500" :
                        config.themeColor === "teal" ? "bg-teal-550" :
                        "bg-blue-500"
                      }`}
                      variants={{
                        initial: { width: "0%" },
                        hover: { width: "100%" }
                      }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    />
                  </motion.button>
                </Link>
              </div>

              {/* Smaller Grid of 6 Products on Right (3 columns, 2 rows) */}
              <div className="lg:col-span-9 grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5 items-stretch">
                {products.slice(0, 6).map((product, idx) => (
                  <CollectionProductCard
                    key={product.id || idx}
                    product={product}
                    themeColor={config.themeColor}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            /* Carousel Display with 1 row scrolling horizontally (Supports flash-sale promo card injections) */
            <div className="relative w-full">
              <motion.div
                ref={scrollContainerRef}
                className="flex gap-6 lg:gap-8 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-4 pt-1 touch-pan-x"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                {/* Countdown Timer Promo Card for Flash Sale */}
                {layout === "flash-sale" && (
                  <div className="w-[240px] sm:w-[280px] shrink-0 snap-start flex flex-col justify-between p-6 rounded-2xl bg-gradient-to-br from-red-600 via-pink-600 to-red-700 text-white shadow-lg relative overflow-hidden group select-none border border-red-500/20">
                    {/* Floating ambient blobs */}
                    <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-white/10 blur-xl group-hover:scale-125 transition-transform duration-500" />

                    <div className="flex flex-col gap-2 relative z-10">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 border border-white/20 text-[10px] font-bold tracking-widest uppercase w-fit animate-pulse">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                        Flash Deal
                      </div>
                      <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-tight mt-2">
                        TODAY'S SPECIALS
                      </h3>
                      <p className="text-xs text-white/80 leading-relaxed font-medium">
                        Exclusive discounts on premium hardware. Don't miss out!
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
                    className="w-[calc((100%-24px)/2)] sm:w-[calc((100%-48px)/3)] lg:w-[calc((100%-96px)/4)] shrink-0 snap-start"
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
