"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { gsap } from "gsap";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRect: DOMRect | null;
}

export default function SearchOverlay({ isOpen, onClose, triggerRect }: SearchOverlayProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const elementsRef = useRef<HTMLDivElement>(null);

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

  // Animate Open/Close
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    if (isOpen) {
      // 1. Calculate click center
      const clickX = triggerRect ? triggerRect.left + triggerRect.width / 2 : window.innerWidth / 2;
      const clickY = triggerRect ? triggerRect.top + triggerRect.height / 2 : window.innerHeight / 2;

      // 2. Calculate maximum circle radius to cover the screen
      const maxRadius = Math.sqrt(
        Math.pow(Math.max(clickX, window.innerWidth - clickX), 2) +
        Math.pow(Math.max(clickY, window.innerHeight - clickY), 2)
      );

      // 3. Set initial state
      gsap.killTweensOf([overlay, elementsRef.current?.children]);
      gsap.set(overlay, {
        visibility: "visible",
        opacity: 1,
        clipPath: `circle(0px at ${clickX}px ${clickY}px)`
      });

      if (elementsRef.current) {
        gsap.set(Array.from(elementsRef.current.children), {
          y: 40,
          opacity: 0
        });
      }

      // 4. Circular zoom open animation
      gsap.to(overlay, {
        clipPath: `circle(${maxRadius + 20}px at ${clickX}px ${clickY}px)`,
        duration: 0.7,
        ease: "power3.out",
        onComplete: () => {
          inputRef.current?.focus();
        }
      });

      // 5. Stagger content text in
      if (elementsRef.current) {
        gsap.to(Array.from(elementsRef.current.children), {
          y: 0,
          opacity: 1,
          duration: 0.5,
          stagger: 0.06,
          delay: 0.2,
          ease: "power2.out"
        });
      }
    } else {
      // Close transition
      const clickX = triggerRect ? triggerRect.left + triggerRect.width / 2 : window.innerWidth / 2;
      const clickY = triggerRect ? triggerRect.top + triggerRect.height / 2 : window.innerHeight / 2;

      gsap.killTweensOf([overlay, elementsRef.current?.children]);

      // Fade content out first
      if (elementsRef.current) {
        gsap.to(Array.from(elementsRef.current.children), {
          y: -20,
          opacity: 0,
          duration: 0.25,
          stagger: 0.03,
          ease: "power2.in"
        });
      }

      // Shrink clip-path circle back to click point
      gsap.to(overlay, {
        clipPath: `circle(0px at ${clickX}px ${clickY}px)`,
        duration: 0.5,
        delay: 0.1,
        ease: "power3.inOut",
        onComplete: () => {
          gsap.set(overlay, { visibility: "hidden" });
          setSearchQuery("");
        }
      });
    }
  }, [isOpen, triggerRect]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Submit Search
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      onClose();
    }
  };

  const handleSuggestionClick = (link: string) => {
    router.push(link);
    onClose();
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] w-screen h-screen bg-background/80 backdrop-blur-2xl flex items-center justify-center pointer-events-auto"
      style={{ visibility: "hidden" }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-3 rounded-full bg-muted/30 border border-border/40 hover:bg-muted/70 transition-all text-foreground hover:scale-105"
        aria-label="Close search overlay"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Main Overlay Content */}
      <div
        ref={containerRef}
        className="w-full max-w-4xl px-6 md:px-12 flex flex-col justify-center"
      >
        <div ref={elementsRef} className="flex flex-col space-y-12">
          {/* Large Title Question */}
          <div className="space-y-3">
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
              What are you looking for?
            </h2>
            <p className="text-muted-foreground/80 text-sm md:text-base font-medium">
              Search products, categories, or brands inside FTC Electronics.
            </p>
          </div>

          {/* Large Minimalist Search Form */}
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
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground/60 hover:text-blue-600 transition-colors"
              aria-label="Search"
            >
              <Search className="h-7 w-7 md:h-9 md:w-9" />
            </button>
          </form>

          {/* Quick suggestions layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
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
                    className="px-4 py-2 text-xs md:text-sm font-semibold bg-muted/30 border border-border/40 hover:border-blue-500/30 hover:bg-blue-50/50 hover:text-blue-600 rounded-full transition-all"
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
                    className="px-4 py-2 text-xs md:text-sm font-semibold bg-muted/30 border border-border/40 hover:border-blue-500/30 hover:bg-blue-50/50 hover:text-blue-600 rounded-full transition-all"
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
