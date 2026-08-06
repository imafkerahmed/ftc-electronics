"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import {
  Laptop,
  Smartphone,
  Keyboard,
  Headphones,
  BatteryCharging,
  Sparkles,
  Plug,
  X,
  ChevronRight,
  Layers,
} from "lucide-react";

interface CategoryCard {
  label: string;
  title: string;
  description: string;
  href: string;
  count: string;
  icon: React.ReactNode;
  glowColor: string;
  hoverColor: string;
  tagColor: string;
}

const defaultCategories: CategoryCard[] = [
  {
    label: "LAPTOPS",
    title: "Laptops & Computing",
    description: "High-Performance Workstations & Ultrabooks",
    href: "/products/laptops",
    count: "48+ Products",
    icon: (
      <Laptop
        className="w-12 h-12 sm:w-28 lg:w-36 sm:h-28 lg:h-36 text-blue-400"
        strokeWidth={1.0}
      />
    ),
    glowColor: "rgba(59,130,246,0.3)",
    hoverColor: "group-hover:text-blue-400",
    tagColor: "bg-blue-500/90 text-white border-blue-400/30",
  },
  {
    label: "KEYBOARDS",
    title: "Keyboards & Switches",
    description: "Custom Mechanical & Tactile Layouts",
    href: "/products/keyboards",
    count: "24+ Products",
    icon: (
      <Keyboard
        className="w-12 h-12 sm:w-20 lg:w-24 sm:h-20 lg:h-24 text-purple-400"
        strokeWidth={1.1}
      />
    ),
    glowColor: "rgba(168,85,247,0.3)",
    hoverColor: "group-hover:text-purple-400",
    tagColor: "bg-purple-500/90 text-white border-purple-400/30",
  },
  {
    label: "AUDIO",
    title: "Audio & Headphones",
    description: "Studio Quality ANC & Wireless Sound",
    href: "/products/audio",
    count: "36+ Products",
    icon: (
      <Headphones
        className="w-12 h-12 sm:w-20 lg:w-24 sm:h-20 lg:h-24 text-rose-400"
        strokeWidth={1.1}
      />
    ),
    glowColor: "rgba(244,63,94,0.3)",
    hoverColor: "group-hover:text-rose-400",
    tagColor: "bg-rose-500/90 text-white border-rose-400/30",
  },
  {
    label: "SMARTPHONES",
    title: "Smartphones & Gear",
    description: "Flagship Mobile Devices & Ecosystem Docks",
    href: "/products/phones",
    count: "60+ Products",
    icon: (
      <Smartphone
        className="w-12 h-12 sm:w-32 lg:w-44 sm:h-32 lg:h-44 text-emerald-400"
        strokeWidth={1.0}
      />
    ),
    glowColor: "rgba(16,185,129,0.35)",
    hoverColor: "group-hover:text-emerald-400",
    tagColor: "bg-emerald-500/90 text-white border-emerald-400/30",
  },
];

export default function CategoryBentoGrid({
  categories: customCategories,
  config,
}: {
  categories?: any[];
  config?: Record<string, any>;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isModalOpen]);

  const sectionBgImage = config?.sectionBackgroundImage || config?.backgroundImage;

  const activeCategories = defaultCategories.map((def, idx) => {
    // If block config specifies slot overrides from Admin Panel
    const slotKey = `slot${idx + 1}`;
    const slotConfig = config?.[slotKey];

    // Find category from database matching selected category slug
    const matchedCategory = customCategories?.find(
      (c) => c.slug === (slotConfig?.slug || (customCategories[idx]?.slug)),
    ) || customCategories?.[idx];

    const title = slotConfig?.title || matchedCategory?.name || def.title;

    const slug = (slotConfig?.slug || matchedCategory?.slug || def.href.replace("/products/","").replace("/products?category=","")).toLowerCase();
    const href = slug.startsWith("/") ? slug : `/products?category=${slug}`;

    const count = matchedCategory
      ? `${matchedCategory.productCount || 0}+ Products`
      : def.count;

    // Detect theme & icon based on title or slug keywords
    const searchText = `${title} ${slug}`.toLowerCase();

    // Default matching description based on category topic
    const defaultDescription = searchText.includes("phone") || searchText.includes("mobile")
      ? "Flagship Mobile Devices & Ecosystem Docks"
      : searchText.includes("power") || searchText.includes("battery") || searchText.includes("charge")
      ? "High-Capacity Fast Charging & Portable Power"
      : searchText.includes("care") || searchText.includes("personal") || searchText.includes("groom")
      ? "Smart Personal Care & Wellness Essentials"
      : searchText.includes("accessor") || searchText.includes("cable") || searchText.includes("gadget")
      ? "Essential Cables, Adapters & Daily Gear"
      : searchText.includes("key")
      ? "Custom Mechanical & Tactile Layouts"
      : searchText.includes("audio") || searchText.includes("head") || searchText.includes("speaker")
      ? "Studio Quality ANC & Wireless Sound"
      : searchText.includes("laptop") || searchText.includes("comp") || searchText.includes("mac")
      ? "High-Performance Workstations & Ultrabooks"
      : def.description;

    const description =
      slotConfig?.description ||
      matchedCategory?.description ||
      matchedCategory?.tagline ||
      defaultDescription;

    let theme = {
      label: slotConfig?.label || (searchText.includes("phone") || searchText.includes("mobile") ? "SMARTPHONES" : searchText.includes("power") || searchText.includes("battery") || searchText.includes("charge") ? "POWER BANKS" : searchText.includes("care") || searchText.includes("personal") || searchText.includes("groom") ? "PERSONAL CARE" : searchText.includes("accessor") || searchText.includes("cable") || searchText.includes("gadget") ? "ACCESSORIES" : searchText.includes("key") ? "KEYBOARDS" : searchText.includes("audio") || searchText.includes("head") || searchText.includes("speaker") ? "AUDIO" : searchText.includes("laptop") || searchText.includes("comp") || searchText.includes("mac") ? "LAPTOPS" : def.label),
      icon: searchText.includes("phone") || searchText.includes("mobile") ? (
        <Smartphone className="w-12 h-12 sm:w-28 lg:w-36 sm:h-28 lg:h-36 text-emerald-400" strokeWidth={1.0} />
      ) : searchText.includes("power") || searchText.includes("battery") || searchText.includes("charge") ? (
        <BatteryCharging className="w-12 h-12 sm:w-28 lg:w-36 sm:h-28 lg:h-36 text-amber-400" strokeWidth={1.0} />
      ) : searchText.includes("care") || searchText.includes("personal") || searchText.includes("groom") ? (
        <Sparkles className="w-12 h-12 sm:w-28 lg:w-36 sm:h-28 lg:h-36 text-cyan-400" strokeWidth={1.0} />
      ) : searchText.includes("accessor") || searchText.includes("cable") || searchText.includes("gadget") ? (
        <Plug className="w-12 h-12 sm:w-28 lg:w-36 sm:h-28 lg:h-36 text-pink-400" strokeWidth={1.0} />
      ) : searchText.includes("key") ? (
        <Keyboard className="w-12 h-12 sm:w-28 lg:w-36 sm:h-28 lg:h-36 text-purple-400" strokeWidth={1.0} />
      ) : searchText.includes("audio") || searchText.includes("head") || searchText.includes("speaker") ? (
        <Headphones className="w-12 h-12 sm:w-28 lg:w-36 sm:h-28 lg:h-36 text-rose-400" strokeWidth={1.0} />
      ) : (
        <Laptop className="w-12 h-12 sm:w-28 lg:w-36 sm:h-28 lg:h-36 text-blue-400" strokeWidth={1.0} />
      ),
      glowColor: searchText.includes("phone") ? "rgba(16,185,129,0.35)" : searchText.includes("power") ? "rgba(245,158,11,0.35)" : searchText.includes("care") ? "rgba(6,182,212,0.35)" : searchText.includes("accessor") ? "rgba(236,72,153,0.35)" : searchText.includes("key") ? "rgba(168,85,247,0.3)" : searchText.includes("audio") ? "rgba(244,63,94,0.3)" : "rgba(59,130,246,0.3)",
      hoverColor: searchText.includes("phone") ? "group-hover:text-emerald-400" : searchText.includes("power") ? "group-hover:text-amber-400" : searchText.includes("care") ? "group-hover:text-cyan-400" : searchText.includes("accessor") ? "group-hover:text-pink-400" : searchText.includes("key") ? "group-hover:text-purple-400" : searchText.includes("audio") ? "group-hover:text-rose-400" : "group-hover:text-blue-400",
      tagColor: searchText.includes("phone") ? "bg-emerald-500/90 text-white border-emerald-400/30" : searchText.includes("power") ? "bg-amber-500/90 text-white border-amber-400/30" : searchText.includes("care") ? "bg-cyan-500/90 text-white border-cyan-400/30" : searchText.includes("accessor") ? "bg-pink-500/90 text-white border-pink-400/30" : searchText.includes("key") ? "bg-purple-500/90 text-white border-purple-400/30" : searchText.includes("audio") ? "bg-rose-500/90 text-white border-rose-400/30" : "bg-blue-500/90 text-white border-blue-400/30",
    };

    return {
      ...def,
      label: theme.label.toUpperCase(),
      title,
      description,
      href,
      count,
      icon: theme.icon,
      glowColor: theme.glowColor,
      hoverColor: theme.hoverColor,
      tagColor: theme.tagColor,
    };
  });

  const [laptops, keyboards, audio, phones] = activeCategories;

  return (
    <section className="w-full py-8 sm:py-12 lg:py-14 border-y border-neutral-200/80 dark:border-white/10 bg-slate-950 text-white relative z-10 overflow-hidden select-none transition-colors">
      {/* ── Optional Admin-Editable Section Background Image ── */}
      {sectionBgImage ? (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <Image
            src={sectionBgImage}
            alt="Category Section Background"
            fill
            unoptimized={sectionBgImage.startsWith("http")}
            className="object-cover object-center opacity-30 transition-opacity duration-700"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/90 via-slate-950/75 to-slate-950/95" />
        </div>
      ) : (
        <>
          {/* Default High-Contrast Stage Ambient Overlay */}
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-black opacity-95 -z-10" />
          <div className="absolute inset-0 z-0 opacity-20 pointer-events-none bg-[radial-gradient(#64748b_1px,transparent_1px)] [background-size:28px_28px]" />
        </>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 relative z-10">
        {/* ── Section Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6 sm:mb-8">
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-[0.25em] text-blue-400 block mb-1">
              Shop by Category
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white uppercase leading-none">
              Browse <span className="text-blue-400">Collections</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 hover:text-blue-400 transition-colors duration-300 group shrink-0 cursor-pointer"
          >
            View All Categories
          </button>
        </div>

        {/* ── Icon-Based Bento Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4.5 items-stretch">
          {/* Left Column: Top wide card + 2 bottom split cards */}
          <div className="lg:col-span-8 flex flex-col gap-3.5 sm:gap-4.5">
            {/* Slot 1: Laptops Wide Bento Card */}
            <IconBentoCard
              card={laptops}
              heightClass="h-[125px] sm:h-[180px] lg:h-[200px]"
              wide
            >
              <div className="absolute right-4 bottom-4 select-none pointer-events-none">
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 sm:w-40 sm:h-40 rounded-full pointer-events-none group-hover:scale-125 transition-transform duration-500 opacity-60"
                  style={{
                    background: `radial-gradient(circle, ${laptops.glowColor} 0%, transparent 70%)`,
                  }}
                />
                <div className="group-hover:scale-110 transition-transform duration-300 transform-gpu">
                  {laptops.icon}
                </div>
              </div>
            </IconBentoCard>

            {/* Bottom Row: Slot 2 & 3 Split Bento Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4.5">
              <IconBentoCard
                card={keyboards}
                heightClass="h-[125px] sm:h-[180px] lg:h-[200px]"
              >
                <div className="absolute right-4 bottom-4 select-none pointer-events-none">
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 sm:w-32 sm:h-32 rounded-full pointer-events-none group-hover:scale-125 transition-transform duration-500 opacity-60"
                    style={{
                      background: `radial-gradient(circle, ${keyboards.glowColor} 0%, transparent 70%)`,
                    }}
                  />
                  <div className="group-hover:scale-110 transition-transform duration-300 transform-gpu">
                    {keyboards.icon}
                  </div>
                </div>
              </IconBentoCard>

              <IconBentoCard
                card={audio}
                heightClass="h-[125px] sm:h-[180px] lg:h-[200px]"
              >
                <div className="absolute right-4 bottom-4 select-none pointer-events-none">
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 sm:w-32 sm:h-32 rounded-full pointer-events-none group-hover:scale-125 transition-transform duration-500 opacity-60"
                    style={{
                      background: `radial-gradient(circle, ${audio.glowColor} 0%, transparent 70%)`,
                    }}
                  />
                  <div className="group-hover:scale-110 transition-transform duration-300 transform-gpu">
                    {audio.icon}
                  </div>
                </div>
              </IconBentoCard>
            </div>
          </div>

          {/* Right Column: Slot 4 Tall Bento Card */}
          <div className="lg:col-span-4">
            <IconBentoCard
              card={phones}
              heightClass="h-[125px] sm:h-[180px] lg:h-full lg:min-h-[416px]"
              tall
            >
              <div className="absolute right-4 bottom-4 lg:inset-0 lg:flex lg:items-center lg:justify-center lg:pb-16 select-none pointer-events-none">
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 sm:w-52 sm:h-52 rounded-full pointer-events-none group-hover:scale-125 transition-transform duration-500 opacity-65"
                  style={{
                    background: `radial-gradient(circle, ${phones.glowColor} 0%, transparent 70%)`,
                  }}
                />
                <div className="group-hover:scale-110 group-hover:-rotate-3 group-hover:-translate-y-1.5 transition-transform duration-300 transform-gpu">
                  {phones.icon}
                </div>
              </div>
            </IconBentoCard>
          </div>
        </div>
      </div>

      {/* ── View All Categories Modal ── */}
      {mounted && isModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div data-lenis-prevent className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
              <div className="bg-slate-900 border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in text-white">
                {/* Header */}
                <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight text-white">
                      Browse All <span className="text-blue-400">Collections</span>
                    </h3>
                    <p className="text-xs text-neutral-400 mt-1">Explore our full range of technology and gear categories.</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-white/5 transition-all cursor-pointer"
                    aria-label="Close modal"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>

                {/* Grid Content */}
                <div data-lenis-prevent className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-none">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {customCategories && customCategories.map((cat) => (
                      <Link
                        key={cat.id}
                        href={`/products?category=${cat.slug}`}
                        onClick={() => setIsModalOpen(false)}
                        className="group relative flex flex-col justify-between p-5 rounded-xl bg-slate-800/40 border border-neutral-800 hover:border-blue-500/50 hover:bg-slate-800/80 transition-all duration-300"
                      >
                        <div className="flex items-center gap-4">
                          <div>
                            <h4 className="font-extrabold uppercase tracking-tight text-white group-hover:text-blue-400 transition-colors duration-200">
                              {cat.name}
                            </h4>
                            <p className="text-[10px] font-bold text-blue-500/80 uppercase mt-0.5 tracking-wider">
                              {cat.count !== undefined ? `${cat.count} Products` : `${cat.productCount || 0} Products`}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-neutral-800/50 pt-3">
                          <span className="text-[10px] text-neutral-400 group-hover:text-white transition-colors">
                            Explore collection
                          </span>
                          <ChevronRight className="h-4 w-4 text-neutral-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function IconBentoCard({
  card,
  heightClass = "h-[200px]",
  children,
  wide = false,
  tall = false,
}: {
  card: CategoryCard;
  heightClass?: string;
  children?: React.ReactNode;
  wide?: boolean;
  tall?: boolean;
}) {
  return (
    <div className="w-full">
      <Link
        href={card.href}
        className={`group relative w-full flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 p-4 sm:p-6 shadow-md hover:border-blue-400/40 hover:shadow-xl transition-all duration-300 ${heightClass}`}
      >
        {/* Subtle inner hover glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.04] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Top Row: Tag Badge */}
        <div className="relative z-10 flex items-center justify-start gap-2">
          <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border ${card.tagColor}`}>
            {card.label}
          </span>
        </div>

        {/* Vector Icon Illustration Layer */}
        {children}

        {/* Bottom Text Content */}
        <div className="relative z-10 mt-auto pt-2">
          <div className={wide ? "max-w-[60%] sm:max-w-[65%]" : tall ? "max-w-[65%] sm:max-w-full" : "max-w-[65%] sm:max-w-[75%]"}>
            <h3
              className={`font-black uppercase tracking-tight text-white leading-tight transition-colors duration-300 ${card.hoverColor} ${
                tall
                  ? "text-sm sm:text-2xl lg:text-3xl"
                  : "text-sm sm:text-xl lg:text-2xl"
              }`}
            >
              {card.title}
            </h3>
            <p className="text-[10px] sm:text-xs text-neutral-400 font-medium mt-0.5 sm:mt-1 line-clamp-1">
              {card.description}
            </p>
          </div>
        </div>
      </Link>
    </div>
  );
}
