"use client";

import Link from "next/link";
import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";

interface QuickNavCategory {
  label: string;
  href: string;
  emoji: string;
  gradient: string;
  textColor: string;
}

const DEFAULT_CATEGORIES: QuickNavCategory[] = [
  {
    label: "Laptops",
    href: "/products/laptops",
    emoji: "💻",
    gradient: "from-blue-500/15 to-blue-600/5",
    textColor: "text-blue-600 dark:text-blue-400",
  },
  {
    label: "Phones",
    href: "/products/phones",
    emoji: "📱",
    gradient: "from-emerald-500/15 to-emerald-600/5",
    textColor: "text-emerald-600 dark:text-emerald-400",
  },
  {
    label: "Audio",
    href: "/products/audio",
    emoji: "🎧",
    gradient: "from-rose-500/15 to-rose-600/5",
    textColor: "text-rose-600 dark:text-rose-400",
  },
  {
    label: "Keyboards",
    href: "/products/keyboards",
    emoji: "⌨️",
    gradient: "from-slate-500/15 to-slate-600/5",
    textColor: "text-slate-600 dark:text-slate-300",
  },
  {
    label: "Accessories",
    href: "/products/accessories",
    emoji: "🔌",
    gradient: "from-orange-500/15 to-orange-600/5",
    textColor: "text-orange-600 dark:text-orange-400",
  },
  {
    label: "Cables",
    href: "/products/cables",
    emoji: "🔗",
    gradient: "from-teal-500/15 to-teal-600/5",
    textColor: "text-teal-600 dark:text-teal-400",
  },
  {
    label: "Smart Home",
    href: "/products/smart-home",
    emoji: "🏠",
    gradient: "from-purple-500/15 to-purple-600/5",
    textColor: "text-purple-600 dark:text-purple-400",
  },
  {
    label: "Gaming",
    href: "/products/gaming",
    emoji: "🎮",
    gradient: "from-indigo-500/15 to-indigo-600/5",
    textColor: "text-indigo-600 dark:text-indigo-400",
  },
  {
    label: "On Sale",
    href: "/deals",
    emoji: "🏷️",
    gradient: "from-red-500/15 to-red-600/5",
    textColor: "text-red-600 dark:text-red-400",
  },
  {
    label: "New In",
    href: "/new-arrivals",
    emoji: "✨",
    gradient: "from-violet-500/15 to-violet-600/5",
    textColor: "text-violet-600 dark:text-violet-400",
  },
];

export default function CategoryQuickNav() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 5);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll);
      checkScroll();
    }
    window.addEventListener("resize", checkScroll);
    return () => {
      el?.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, []);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: dir === "left" ? -240 : 240,
      behavior: "smooth",
    });
  };

  return (
    <section className="w-full border-b border-border bg-background relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 relative">
        {/* Scroll Arrows — desktop only */}
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm items-center justify-center text-neutral-500 hover:text-blue-600 transition-all cursor-pointer hover:scale-105"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 z-20 h-8 w-8 rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-sm items-center justify-center text-neutral-500 hover:text-blue-600 transition-all cursor-pointer hover:scale-105"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* Scrollable Strip */}
        <div
          ref={scrollRef}
          className="flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-none touch-pan-x sm:px-6"
        >
          {DEFAULT_CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className="shrink-0"
            >
              <Link
                href={cat.href}
                className={`group flex flex-col items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-2xl border border-transparent hover:border-neutral-200/80 dark:hover:border-neutral-700/60 bg-gradient-to-br ${cat.gradient} hover:shadow-sm transition-all duration-200 cursor-pointer min-w-[72px] select-none`}
              >
                <span className="text-xl sm:text-2xl leading-none group-hover:scale-110 transition-transform duration-200">
                  {cat.emoji}
                </span>
                <span className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wide leading-none ${cat.textColor} whitespace-nowrap`}>
                  {cat.label}
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
