"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useLenis } from "lenis/react";
import { MOCK_PRODUCTS } from "@/lib/db";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchOverlay({ isOpen, onClose }: SearchOverlayProps) {
  const router = useRouter();
  const lenis = useLenis();
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const categories = [
    { label: "Laptops", link: "/products?category=laptops" },
    { label: "Phones", link: "/products?category=phones" },
    { label: "Audio", link: "/products?category=audio" },
    { label: "Accessories", link: "/coming-soon" },
  ];

  const brands = [
    { label: "Apple", link: "/products?brand=apple" },
    { label: "Samsung", link: "/products?brand=samsung" },
    { label: "Sony", link: "/products?brand=sony" },
    { label: "Bose", link: "/products?brand=bose" },
    { label: "Asus", link: "/products?brand=asus" },
  ];

  // Live filter products as user types
  const searchResults = searchQuery.trim() === ""
    ? []
    : MOCK_PRODUCTS.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.brand.toLowerCase().includes(searchQuery.toLowerCase())
      );

  // Lock scroll without layout shift: compensate for scrollbar width
  useEffect(() => {
    if (isOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.style.overflow = "hidden";
      lenis?.stop();
      // Focus input after transition starts
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
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
  }, [isOpen, lenis]);

  // Clear query when closed
  useEffect(() => {
    if (!isOpen) {
      const t = setTimeout(() => setSearchQuery(""), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      onClose();
    }
  };

  const handleSuggestionClick = useCallback((link: string) => {
    router.push(link);
    onClose();
  }, [router, onClose]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    mounted ? createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="search-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ backgroundColor: "var(--background)" }}
          data-lenis-prevent
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-3 rounded-full bg-muted/30 border border-border/40 hover:bg-muted/70 transition-colors text-foreground cursor-pointer"
            aria-label="Close search overlay"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Main Content */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: "easeOut", delay: 0.05 }}
            className="w-full max-w-4xl px-6 md:px-12 flex flex-col justify-center"
          >
            <div className="flex flex-col space-y-12">
              {/* Title */}
              <div className="space-y-3">
                <h2 className="text-3xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground uppercase">
                  What are you looking for?
                </h2>
                <p className="text-muted-foreground/80 text-sm md:text-base font-medium">
                  Search products, categories, or brands inside FTC Electronics.
                </p>
              </div>

              {/* Search Form */}
              <form onSubmit={handleSubmit} className="relative w-full group">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Type to search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-2xl md:text-4xl lg:text-5xl font-light py-4 pr-16 bg-transparent border-b border-border/80 text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-blue-600 transition-colors"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground/60 hover:text-blue-600 transition-colors cursor-pointer"
                  aria-label="Search"
                >
                  <Search className="h-7 w-7 md:h-9 md:w-9" />
                </button>
              </form>

              {/* Results or Quick Suggestions */}
              <div className="pt-4">
                {searchQuery.trim() !== "" ? (
                  <div className="space-y-4">
                    <h3 className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold border-b border-border/50 pb-2">
                      Matching Products ({searchResults.length})
                    </h3>
                    {searchResults.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-2">
                        {searchResults.map((product) => (
                          <button
                            key={product.id}
                            onClick={() => handleSuggestionClick(`/products/${product.slug}`)}
                            className="flex items-center gap-4 p-3 rounded-xl border border-border/40 hover:border-blue-500/30 bg-muted/20 hover:bg-muted/40 transition-colors text-left group cursor-pointer"
                          >
                            <div className="relative w-12 h-12 bg-white rounded-lg flex items-center justify-center p-1 overflow-hidden shrink-0 border border-border/20">
                              <Image
                                src={product.images[0]}
                                alt={product.name}
                                fill
                                sizes="48px"
                                className="object-contain"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-foreground truncate group-hover:text-blue-600 transition-colors">
                                {product.name}
                              </h4>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">
                                {product.brand} {"//"}  {product.category}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-xs font-mono font-bold text-foreground block">
                                ${product.discountPrice || product.price}
                              </span>
                              {product.discountPrice && (
                                <span className="text-[10px] font-mono text-muted-foreground line-through block">
                                  ${product.price}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-muted-foreground">
                        No products found matching &ldquo;<span className="text-foreground font-semibold">{searchQuery}</span>&rdquo;.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Categories */}
                    <div className="space-y-4">
                      <h3 className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">
                        Trending Categories
                      </h3>
                      <div className="flex flex-wrap gap-2.5">
                        {categories.map((c) => (
                          <button
                            key={c.label}
                            onClick={() => handleSuggestionClick(c.link)}
                            className="px-4 py-2 text-xs md:text-sm font-semibold bg-muted/30 border border-border/40 hover:border-blue-500/30 hover:bg-blue-50/50 hover:text-blue-600 rounded-full transition-colors cursor-pointer"
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Brands */}
                    <div className="space-y-4">
                      <h3 className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">
                        Popular Brands
                      </h3>
                      <div className="flex flex-wrap gap-2.5">
                        {brands.map((b) => (
                          <button
                            key={b.label}
                            onClick={() => handleSuggestionClick(b.link)}
                            className="px-4 py-2 text-xs md:text-sm font-semibold bg-muted/30 border border-border/40 hover:border-blue-500/30 hover:bg-blue-50/50 hover:text-blue-600 rounded-full transition-colors cursor-pointer"
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  ) : null);
}
