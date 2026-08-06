"use client";

import { useState, use, useEffect } from "react";
import { SlidersHorizontal, Search, ArrowLeft } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useProducts } from "@/hooks/use-products";
import { getProducts, getCategories } from "@/lib/db";
import type { Product } from "@/types/product";
import FilterSidebar from "@/components/product/filter-sidebar";
import ProductGrid from "@/components/product/product-grid";
import { Button } from "@/components/ui/button";
import { useLenis } from "lenis/react";
import { createPortal } from "react-dom";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function ProductsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = use(searchParams);
  const categoryParam =
    typeof resolvedSearchParams.category === "string"
      ? resolvedSearchParams.category
      : undefined;
  const searchParam =
    typeof resolvedSearchParams.search === "string"
      ? resolvedSearchParams.search
      : "";

  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
     
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const [products, setProducts] = useState<Product[]>([]);
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([getProducts(), getCategories()]).then(([prods, cats]) => {
      setProducts(prods);
      setCategoriesList(cats.filter(c => c.isActive !== false).map(c => c.name));
      setIsLoading(false);
    });
  }, []);

  // Initialize filtering logic
  const { filters, filteredProducts, brands, updateFilters, resetFilters } =
    useProducts(products);

  // Set initial query filters from URL params if present
  useEffect(() => {
    if (categoryParam || searchParam) {
      updateFilters({
        category: categoryParam,
        search: searchParam,
      });
    }
  }, [categoryParam, searchParam, updateFilters]);

  // Lock scrolling when mobile filter drawer is open
  const lenis = useLenis();
  useEffect(() => {
    if (isMobileFiltersOpen) {
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.style.overflow = "hidden";
      lenis?.stop();
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      lenis?.start();
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
      lenis?.start();
    };
  }, [isMobileFiltersOpen, lenis]);



  // Calculate active filters count
  const activeFiltersCount = [
    filters.category !== undefined,
    filters.brand !== undefined,
    filters.minPrice !== undefined,
    filters.maxPrice !== undefined,
    filters.search !== undefined && filters.search !== "",
  ].filter(Boolean).length;

  // Dynamic heading based on active category
  const activeCategory = filters.category
    ? categoriesList.find((c) => c.toLowerCase() === filters.category)
    : null;

  const headingText = activeCategory ?? "Product Catalog";
  const subText = activeCategory
    ? `Showing all ${activeCategory} products`
    : "Browse our premium collection of performance computers, peripherals, and smartphones.";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">

      {/* Page Header */}
      <div className="relative mb-6 sm:mb-8 rounded-2xl overflow-hidden bg-card border border-border p-4 sm:p-8">
        {/* Subtle grid texture */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.4)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.4)_1px,transparent_1px)] bg-[size:32px_32px] opacity-50" />
        {/* Soft blue glow — top right */}
        <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-blue-500/8 blur-3xl" />

        {/* Blue accent rule */}
        <div className="mb-3 sm:mb-5 h-[3px] w-8 sm:w-10 rounded-full bg-gradient-to-r from-blue-500 to-indigo-400" />

        {/* Back link when category is active */}
        {activeCategory && (
          <button
            onClick={() => updateFilters({ category: undefined })}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors mb-3 cursor-pointer group uppercase tracking-widest select-none"
          >
            <ArrowLeft className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" />
            All Products
          </button>
        )}

        {/* Heading */}
        <h1 className="text-xl sm:text-3xl md:text-4xl font-black tracking-tight text-foreground capitalize leading-none mb-1.5 sm:mb-2">
          {headingText}
        </h1>

        {/* Subtitle */}
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-lg mt-1.5 sm:mt-3">
          {subText}
        </p>
      </div>

      {/* Control Header Bar */}
      <div className="flex items-center justify-between gap-4 py-2.5 mb-6 border-b border-border/50">
        {/* Left: Mobile Filters toggle + results count */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileFiltersOpen(true)}
            className="md:hidden inline-flex items-center gap-2 px-3.5 py-2 bg-card border border-border/80 text-foreground text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-muted transition-colors cursor-pointer select-none"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="h-4 min-w-[16px] px-1 flex items-center justify-center bg-blue-600 text-white text-[9px] font-bold rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Desktop result count — clean text */}
          <p className="hidden md:block text-sm text-muted-foreground">
            <span className="font-bold text-foreground tabular-nums">{filteredProducts.length}</span>
            <span className="mx-1.5 text-border">/</span>
            <span>{products.length} products</span>
          </p>
        </div>

        {/* Right: mobile count + clear */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-medium md:hidden">
            <span className="font-bold text-foreground">{filteredProducts.length}</span> items
          </span>
          {activeFiltersCount > 0 && (
            <button
              onClick={resetFilters}
              className="text-xs font-semibold text-blue-500 hover:text-blue-600 transition-colors uppercase tracking-wider cursor-pointer select-none"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Catalog Split Layout */}
      <div className="flex flex-col md:flex-row gap-8 items-start">

        {/* Desktop Filter Sidebar — sticky, independently scrollable */}
        <div
          className="hidden md:block sticky top-24 self-start"
          data-lenis-prevent
        >
          <FilterSidebar
            filters={filters}
            brands={brands}
            categories={categoriesList}
            updateFilters={updateFilters}
            resetFilters={resetFilters}
          />
        </div>

        {/* Product Grid or Empty State */}
        <div className="flex-1 w-full min-w-0">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
              <div className="h-16 w-16 rounded-2xl bg-muted/60 border border-border/80 flex items-center justify-center mb-5">
                <Search className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-black text-foreground tracking-tight mb-2">
                No products found
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs mb-6">
                Try adjusting your filters or search term — we have plenty of great products waiting.
              </p>
              <Button
                onClick={resetFilters}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl px-6 py-5 cursor-pointer"
              >
                Clear All Filters
              </Button>
            </div>
          ) : (
            <ProductGrid products={filteredProducts} />
          )}
        </div>
      </div>

      {/* Mobile filters drawer */}
      {mounted && typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {isMobileFiltersOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileFiltersOpen(false)}
                className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-xs md:hidden"
              />
              {/* Drawer Sheet */}
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
                className="fixed inset-y-0 left-0 z-[100] w-full max-w-[280px] bg-card border-r border-border p-6 shadow-2xl flex flex-col md:hidden overflow-y-auto overscroll-contain [touch-action:pan-y]"
                data-lenis-prevent
              >
                <FilterSidebar
                  filters={filters}
                  brands={brands}
                  categories={categoriesList}
                  updateFilters={updateFilters}
                  resetFilters={resetFilters}
                  onClose={() => setIsMobileFiltersOpen(false)}
                  className="border-none bg-transparent p-0 w-full shadow-none max-h-none"
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
