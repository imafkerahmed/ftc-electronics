'use client';

import { useState } from 'react';
import { ProductFilterParams } from '@/types/product';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface FilterSidebarProps {
  filters: ProductFilterParams;
  brands: string[];
  categories: string[];
  updateFilters: (filters: Partial<ProductFilterParams>) => void;
  resetFilters: () => void;
  onClose?: () => void;
  className?: string;
}

export default function FilterSidebar({
  filters,
  brands,
  categories,
  updateFilters,
  resetFilters,
  onClose,
  className,
}: FilterSidebarProps) {
  // Collapsible section state
  const [sections, setSections] = useState({
    search: true,
    categories: true,
    brands: true,
    price: true,
    sort: true,
  });

  const toggleSection = (key: keyof typeof sections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePriceBracket = (min: number | undefined, max: number | undefined) => {
    updateFilters({ minPrice: min, maxPrice: max });
  };

  // Helper check if price bracket is active
  const isBracketActive = (min: number | undefined, max: number | undefined) => {
    return filters.minPrice === min && filters.maxPrice === max;
  };

  return (
    <aside className={cn("w-full md:w-66 shrink-0 flex flex-col gap-5 text-foreground bg-card p-5 rounded-2xl border border-border shadow-xs overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(59,130,246,0.3)_transparent] max-h-[calc(100vh-7rem)]", className)}>
      
      {/* Drawer Header (Mobile only) */}
      {onClose && (
        <div className="flex items-center justify-between pb-3.5 border-b border-border/80 md:hidden">
          <h2 className="text-sm font-black tracking-wider uppercase text-foreground">Filter Catalog</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center justify-center active:scale-95"
            aria-label="Close filters"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      )}

      {/* 1. Search Section */}
      <div className="flex flex-col">
        <button
          onClick={() => toggleSection('search')}
          className="flex items-center justify-between py-1 text-left cursor-pointer group"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">Search</span>
          <ChevronDown 
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200", 
              sections.search ? "transform rotate-180" : ""
            )} 
          />
        </button>
        
        <AnimatePresence initial={false}>
          {sections.search && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: 'auto', opacity: 1, marginTop: 12 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <Input
                type="text"
                placeholder="Search products..."
                value={filters.search || ''}
                onChange={(e) => updateFilters({ search: e.target.value })}
                className="h-9 bg-background border-border text-foreground text-xs focus-visible:ring-blue-500 rounded-lg placeholder:text-muted-foreground/50"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="h-px bg-border/50" />

      {/* 2. Categories Section */}
      <div className="flex flex-col">
        <button
          onClick={() => toggleSection('categories')}
          className="flex items-center justify-between py-1 text-left cursor-pointer group"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">Categories</span>
          <ChevronDown 
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200", 
              sections.categories ? "transform rotate-180" : ""
            )} 
          />
        </button>

        <AnimatePresence initial={false}>
          {sections.categories && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: 'auto', opacity: 1, marginTop: 12 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-1.5 pb-1">
                <button
                  onClick={() => updateFilters({ category: undefined })}
                  className={cn(
                    "px-2.5 py-1 text-[11px] rounded-full border transition-all cursor-pointer font-semibold active:scale-95",
                    filters.category === undefined 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs' 
                      : 'bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/80'
                  )}
                >
                  All Products
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => updateFilters({ category: cat.toLowerCase() })}
                    className={cn(
                      "px-2.5 py-1 text-[11px] rounded-full border transition-all cursor-pointer font-semibold capitalize active:scale-95",
                      filters.category === cat.toLowerCase() 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs' 
                        : 'bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/80'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="h-px bg-border/50" />

      {/* 3. Brands Section */}
      <div className="flex flex-col">
        <button
          onClick={() => toggleSection('brands')}
          className="flex items-center justify-between py-1 text-left cursor-pointer group"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">Brands</span>
          <ChevronDown 
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200", 
              sections.brands ? "transform rotate-180" : ""
            )} 
          />
        </button>

        <AnimatePresence initial={false}>
          {sections.brands && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: 'auto', opacity: 1, marginTop: 12 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-1.5 pb-1">
                <button
                  onClick={() => updateFilters({ brand: undefined })}
                  className={cn(
                    "px-2.5 py-1 text-[11px] rounded-full border transition-all cursor-pointer font-semibold active:scale-95",
                    filters.brand === undefined 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs' 
                      : 'bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/80'
                  )}
                >
                  All Brands
                </button>
                {brands.map((brand) => (
                  <button
                    key={brand}
                    onClick={() => updateFilters({ brand: brand.toLowerCase() })}
                    className={cn(
                      "px-2.5 py-1 text-[11px] rounded-full border transition-all cursor-pointer font-semibold active:scale-95",
                      filters.brand === brand.toLowerCase() 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs' 
                        : 'bg-muted/40 border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/80'
                    )}
                  >
                    {brand}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="h-px bg-border/50" />

      {/* 4. Price Section */}
      <div className="flex flex-col">
        <button
          onClick={() => toggleSection('price')}
          className="flex items-center justify-between py-1 text-left cursor-pointer group"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">Price Range</span>
          <ChevronDown 
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200", 
              sections.price ? "transform rotate-180" : ""
            )} 
          />
        </button>

        <AnimatePresence initial={false}>
          {sections.price && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: 'auto', opacity: 1, marginTop: 12 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-3 pb-1">
                {/* Custom inputs grid */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-semibold">$</span>
                    <Input
                      type="number"
                      placeholder="Min"
                      value={filters.minPrice ?? ''}
                      onChange={(e) =>
                        updateFilters({
                          minPrice: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="h-8.5 pl-6 bg-background border-border text-xs focus-visible:ring-blue-500 rounded-lg placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <span className="text-muted-foreground/40 text-xs">-</span>
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-semibold">$</span>
                    <Input
                      type="number"
                      placeholder="Max"
                      value={filters.maxPrice ?? ''}
                      onChange={(e) =>
                        updateFilters({
                          maxPrice: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      className="h-8.5 pl-6 bg-background border-border text-xs focus-visible:ring-blue-500 rounded-lg placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>

                {/* Price Bracket Tags */}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <button
                    onClick={() => handlePriceBracket(undefined, 100)}
                    className={cn(
                      "px-2.5 py-1 text-[10px] rounded-full border transition-all cursor-pointer font-bold active:scale-95",
                      isBracketActive(undefined, 100)
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-muted/30 border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    )}
                  >
                    Under $100
                  </button>
                  <button
                    onClick={() => handlePriceBracket(100, 500)}
                    className={cn(
                      "px-2.5 py-1 text-[10px] rounded-full border transition-all cursor-pointer font-bold active:scale-95",
                      isBracketActive(100, 500)
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-muted/30 border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    )}
                  >
                    $100 - $500
                  </button>
                  <button
                    onClick={() => handlePriceBracket(500, undefined)}
                    className={cn(
                      "px-2.5 py-1 text-[10px] rounded-full border transition-all cursor-pointer font-bold active:scale-95",
                      isBracketActive(500, undefined)
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-muted/30 border-border/80 text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    )}
                  >
                    $500+
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="h-px bg-border/50" />

      {/* 5. Sort Section */}
      <div className="flex flex-col">
        <button
          onClick={() => toggleSection('sort')}
          className="flex items-center justify-between py-1 text-left cursor-pointer group"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">Sort By</span>
          <ChevronDown 
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200", 
              sections.sort ? "transform rotate-180" : ""
            )} 
          />
        </button>

        <AnimatePresence initial={false}>
          {sections.sort && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: 'auto', opacity: 1, marginTop: 12 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <select
                value={filters.sortBy || 'newest'}
                onChange={(e) =>
                  updateFilters({ sortBy: e.target.value as ProductFilterParams['sortBy'] })
                }
                className="w-full h-8.5 bg-background border border-border text-xs text-foreground rounded-lg px-2.5 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer select-none"
              >
                <option value="newest">Newest Arrivals</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="rating">Top Rated</option>
              </select>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="h-px bg-border/50" />

      {/* Reset Action */}
      <Button
        variant="outline"
        size="sm"
        onClick={resetFilters}
        className="mt-2 text-muted-foreground border-border hover:bg-muted hover:text-foreground cursor-pointer rounded-xl py-4.5 w-full font-bold text-xs uppercase tracking-wider transition-colors active:scale-98"
      >
        Clear All Filters
      </Button>

    </aside>
  );
}
