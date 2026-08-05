"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Product } from "@/types/product";
import CollectionProductCard from "./collection-product-card";

interface TabbedProductShowcaseProps {
  onSaleProducts: Product[];
  newArrivalProducts: Product[];
  airPurifierProducts: Product[];
}

type TabId = "sale" | "new" | "air";

export default function TabbedProductShowcase({
  onSaleProducts,
  newArrivalProducts,
  airPurifierProducts,
}: TabbedProductShowcaseProps) {
  const [activeTab, setActiveTab] = useState<TabId>("sale");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Navigation button states
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Tab definitions
  const tabs = [
    {
      id: "sale" as const,
      name: "On-Sale",
      products: onSaleProducts,
      seeAllLink: "/products?filter=on-sale",
      themeColor: "red" as const,
      accentClass: "text-red-500 dark:text-red-400",
      glowBg:
        "bg-[radial-gradient(circle_at_30%_30%,rgba(239,68,68,0.06),transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_30%,rgba(239,68,68,0.11),transparent_50%)]",
      badgeText: "Limited Stocks",
      badgeColor:
        "border-red-500/20 bg-red-500/5 text-red-600 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-400",
    },
    {
      id: "new" as const,
      name: "New Arrivals",
      products: newArrivalProducts,
      seeAllLink: "/products?sortBy=newest",
      themeColor: "purple" as const,
      accentClass: "text-violet-500 dark:text-violet-400",
      glowBg:
        "bg-[radial-gradient(circle_at_50%_30%,rgba(139,92,246,0.06),transparent_50%)] dark:bg-[radial-gradient(circle_at_50%_30%,rgba(139,92,246,0.11),transparent_50%)]",
      badgeText: "New Releases",
      badgeColor:
        "border-violet-500/20 bg-violet-500/5 text-violet-600 dark:border-violet-500/35 dark:bg-violet-500/10 dark:text-violet-400",
    },
    {
      id: "air" as const,
      name: "Air Purifiers",
      products: airPurifierProducts,
      seeAllLink: "/products?category=air-purifiers",
      themeColor: "teal" as const,
      accentClass: "text-teal-500 dark:text-teal-400",
      glowBg:
        "bg-[radial-gradient(circle_at_70%_30%,rgba(20,184,166,0.06),transparent_50%)] dark:bg-[radial-gradient(circle_at_70%_30%,rgba(20,184,166,0.11),transparent_50%)]",
      badgeText: "Smart Climate",
      badgeColor:
        "border-teal-500/20 bg-teal-500/5 text-teal-600 dark:border-teal-500/35 dark:bg-teal-500/10 dark:text-teal-400",
    },
  ];

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];

  // Check scroll positions of the active container
  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  // Reset scroll and re-check scroll abilities when tab switches or active products list changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0;
    }
    // Give Next.js time to update render before checking size
    const timer = setTimeout(() => {
      checkScroll();
    }, 100);
    return () => clearTimeout(timer);
  }, [activeTab]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScroll);
      window.addEventListener("resize", checkScroll);
      checkScroll();
    }
    return () => {
      if (container) {
        container.removeEventListener("scroll", checkScroll);
      }
      window.removeEventListener("resize", checkScroll);
    };
  }, [currentTab.products]);

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

  return (
    <div className="w-full py-12 sm:py-16 border-b border-border bg-background relative overflow-hidden z-10">
      {/* Aurora glow shifting background based on active tab */}
      <div
        className={`absolute inset-0 pointer-events-none transition-all duration-1000 -z-10 ${currentTab.glowBg}`}
      />

      <div className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 flex flex-col gap-8">
        {/* Unified Tab Bar Header */}
        <div className="w-full flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-neutral-100 dark:border-neutral-800/60 pb-4">
          {/* Large Header Tabs on the Left */}
          <div className="flex flex-wrap items-end gap-x-6 sm:gap-x-10 gap-y-4">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="relative pb-2 text-left cursor-pointer transition-all duration-300 focus:outline-none"
                >
                  <span
                    className={`text-xl sm:text-2xl lg:text-3xl font-black uppercase tracking-tight leading-none transition-all duration-300 ${
                      isActive
                        ? tab.accentClass
                        : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-400"
                    }`}
                  >
                    {tab.name}
                  </span>

                  {/* Red/Purple/Teal underline animation on active */}
                  {isActive && (
                    <motion.div
                      layoutId="activeTabUnderline"
                      className={`absolute bottom-0 inset-x-0 h-1 rounded-full ${
                        tab.themeColor === "red"
                          ? "bg-red-500"
                          : tab.themeColor === "purple"
                            ? "bg-violet-500"
                            : "bg-teal-500"
                      }`}
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 30,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Controls Side (See All & Scroll buttons) */}
          <div className="flex items-center justify-between md:justify-end gap-6 shrink-0">
            {/* Contextual Badge */}
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border hidden sm:inline-block ${currentTab.badgeColor}`}
            >
              {currentTab.badgeText}
            </span>

            <div className="flex items-center gap-4">
              {/* See All link */}
              <Link
                href={currentTab.seeAllLink}
                className="group flex items-center text-xs font-semibold text-muted-foreground hover:text-blue-650 dark:hover:text-blue-400 transition-colors duration-200"
              >
                <span>See All</span>
                <ChevronRight className="h-3.5 w-3.5 ml-0.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>

              {/* Navigation Arrows */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleScroll("left")}
                  disabled={!canScrollLeft}
                  className={`h-9 w-9 rounded-full border flex items-center justify-center transition-all duration-300 cursor-pointer backdrop-blur-xs shadow-xs ${
                    canScrollLeft
                      ? `border-neutral-300/80 bg-white/40 text-neutral-800 dark:border-neutral-700/80 dark:bg-neutral-900/40 dark:text-neutral-200 hover:scale-105 active:scale-95 ${
                          currentTab.themeColor === "red"
                            ? "hover:border-red-500/40 hover:text-red-500 hover:bg-red-500/5"
                            : currentTab.themeColor === "purple"
                              ? "hover:border-violet-500/40 hover:text-violet-500 hover:bg-violet-500/5"
                              : "hover:border-teal-500/40 hover:text-teal-500 hover:bg-teal-500/5"
                        }`
                      : "border-neutral-250 dark:border-neutral-800 text-neutral-300 dark:text-neutral-700 opacity-40 cursor-not-allowed"
                  }`}
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <button
                  onClick={() => handleScroll("right")}
                  disabled={!canScrollRight}
                  className={`h-9 w-9 rounded-full border flex items-center justify-center transition-all duration-300 cursor-pointer backdrop-blur-xs shadow-xs ${
                    canScrollRight
                      ? `border-neutral-300/80 bg-white/40 text-neutral-800 dark:border-neutral-700/80 dark:bg-neutral-900/40 dark:text-neutral-200 hover:scale-105 active:scale-95 ${
                          currentTab.themeColor === "red"
                            ? "hover:border-red-500/40 hover:text-red-500 hover:bg-red-500/5"
                            : currentTab.themeColor === "purple"
                              ? "hover:border-violet-500/40 hover:text-violet-500 hover:bg-violet-500/5"
                              : "hover:border-teal-500/40 hover:text-teal-500 hover:bg-teal-500/5"
                        }`
                      : "border-neutral-250 dark:border-neutral-800 text-neutral-300 dark:text-neutral-700 opacity-40 cursor-not-allowed"
                  }`}
                  aria-label="Scroll right"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Carousel Product Showcase Wrapper */}
        <div className="relative w-full overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              ref={scrollContainerRef}
              className="flex gap-6 lg:gap-8 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-4 pt-1 touch-pan-x"
            >
              {currentTab.products.map((product, idx) => (
                <div
                  key={product.id || idx}
                  className="w-[calc((100%-24px)/2)] sm:w-[calc((100%-48px)/3)] lg:w-[calc((100%-96px)/4)] shrink-0 snap-start"
                >
                  <CollectionProductCard
                    product={product}
                    themeColor={currentTab.themeColor}
                  />
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
