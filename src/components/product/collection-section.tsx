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
        return "bg-violet-50/20 dark:bg-violet-950/5 border-y border-violet-100/30 dark:border-violet-900/10 py-8 sm:py-12";
      case "red":
        return "bg-red-50/20 dark:bg-red-950/5 border-y border-red-100/30 dark:border-red-900/10 py-8 sm:py-12";
      case "teal":
        return "bg-teal-50/20 dark:bg-teal-950/5 border-y border-teal-100/30 dark:border-teal-900/10 py-8 sm:py-12";
      case "blue":
      default:
        return "bg-blue-50/20 dark:bg-blue-950/5 border-y border-blue-100/30 dark:border-blue-900/10 py-8 sm:py-12";
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
            /* Integrated Bento Grid Layout */
            <motion.div
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 items-stretch"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {/* Campaign Card Embedded inside the Grid */}
              <div className={`col-span-2 md:col-span-3 lg:col-span-2 flex flex-col justify-between p-6 sm:p-8 rounded-3xl transition-all duration-500 hover:-translate-y-1.5 z-10 relative overflow-hidden group select-none min-h-[220px] border ${
                config.themeColor === "purple" ? "bg-violet-50/60 dark:bg-violet-950/10 border-violet-200/40 dark:border-violet-900/20 hover:border-violet-500/30 hover:shadow-[0_20px_40px_rgba(139,92,246,0.03)]" :
                config.themeColor === "red" ? "bg-red-50/60 dark:bg-red-950/10 border-red-200/40 dark:border-red-900/20 hover:border-red-500/30 hover:shadow-[0_20px_40px_rgba(239,68,68,0.03)]" :
                config.themeColor === "teal" ? "bg-teal-50/60 dark:bg-teal-950/10 border-teal-200/40 dark:border-teal-900/20 hover:border-teal-500/30 hover:shadow-[0_20px_40px_rgba(20,184,166,0.03)]" :
                "bg-blue-50/60 dark:bg-blue-950/10 border-blue-200/40 dark:border-blue-900/20 hover:border-blue-500/30 hover:shadow-[0_20px_40px_rgba(59,130,246,0.03)]"
              }`}>
                
                {/* Background Tech Grid Pattern */}
                <div className="absolute inset-0 opacity-20 dark:opacity-10 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none -z-10" />

                {/* Diagonal gloss reflection overlay */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none -z-5">
                  <div className="absolute -inset-x-40 top-0 bottom-0 bg-gradient-to-r from-transparent via-white/20 dark:via-white/5 to-transparent -skew-x-25 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-[1200ms] ease-in-out" />
                </div>

                {/* Background light glow matching the product card subtle hover glows */}
                <motion.div 
                  className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full blur-[80px] pointer-events-none -z-10 ${
                    config.themeColor === "purple" ? "bg-violet-500/10 dark:bg-violet-500/5" :
                    config.themeColor === "red" ? "bg-red-500/10 dark:bg-red-500/5" :
                    config.themeColor === "teal" ? "bg-teal-500/10 dark:bg-teal-500/5" :
                    "bg-blue-500/10 dark:bg-blue-500/5"
                  }`}
                  animate={{
                    y: [-15, 15, -15],
                    x: [-10, 10, -10],
                    scale: [1, 1.15, 1]
                  }}
                  transition={{
                    duration: 7,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />

                <div className="flex flex-col h-full justify-between gap-6 z-10 relative">
                  {/* Top content: Badge and Title */}
                  <div className="flex flex-col items-start gap-2.5">
                    {/* Title */}
                    <h3 className="text-xl sm:text-2xl md:text-3.5xl font-black uppercase tracking-[0.05em] font-sans leading-none text-left mt-1.5">
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
                    </h3>

                    {/* Description */}
                    <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 font-medium max-w-sm mt-1.5 leading-relaxed">
                      {config.defaultSubtitle}. Discover premium hardware with guaranteed performance, curated details, and exclusive checkout options.
                    </p>
                  </div>

                  {/* Bottom content: Explore Now CTA Link */}
                  <Link href={seeAllLink} className="relative block shrink-0 mt-4">
                    <motion.button 
                      initial="initial"
                      whileHover="hover"
                      className="group relative inline-flex items-center gap-1.5 pb-1 focus:outline-none cursor-pointer text-[10px] font-black uppercase tracking-widest text-neutral-850 dark:text-neutral-200 transition-colors duration-300 select-none"
                      whileTap={{ scale: 0.98 }}
                      aria-label="Explore Collection"
                    >
                      <span>Explore Collection</span>
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
                          config.themeColor === "teal" ? "text-teal-555" :
                          "text-blue-500"
                        }`} />
                      </motion.span>
                      
                      {/* Interactive expanding underline */}
                      <motion.span 
                        className={`absolute bottom-0 left-0 h-[2px] rounded-full ${
                          config.themeColor === "purple" ? "bg-violet-500" :
                          config.themeColor === "red" ? "bg-red-500" :
                          config.themeColor === "teal" ? "bg-teal-555" :
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
              </div>

              {/* Grid of Product Cards */}
              {products.slice(0, 6).map((product, idx) => (
                <CollectionProductCard
                  key={product.id || idx}
                  product={product}
                  themeColor={config.themeColor}
                />
              ))}
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
                  <div className="w-[260px] sm:w-[290px] lg:w-[300px] shrink-0 snap-start flex flex-col justify-between p-6 rounded-2xl bg-gradient-to-br from-red-600 via-pink-600 to-red-700 text-white shadow-lg relative overflow-hidden group select-none border border-red-500/20">
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
                    className="w-[260px] sm:w-[290px] lg:w-[calc((100%-96px)/4)] shrink-0 snap-start"
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
