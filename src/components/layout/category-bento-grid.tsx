"use client";

import Link from "next/link";
import {
  ArrowRight,
  Laptop,
  Smartphone,
  Keyboard,
  Headphones,
} from "lucide-react";
import { motion } from "motion/react";
import InteractiveGridBackground from "@/components/lightswind/interactive-grid-background";

interface CategoryCard {
  label: string;
  title: string;
  description: string;
  href: string;
  count: string;
  icon: React.ReactNode;
  glowColor: string;
  hoverColor: string;
  iconBg: string;
}

const categories: CategoryCard[] = [
  {
    label: "LAPTOPS",
    title: "Laptops & Computing",
    description: "High-Performance Workstations",
    href: "/products/laptops",
    count: "48+ Products",
    icon: (
      <Laptop
        className="w-12 h-12 sm:w-20 lg:w-28 sm:h-20 lg:h-28 text-blue-600"
        strokeWidth={1.2}
      />
    ),
    glowColor: "rgba(59,130,246,0.2)",
    hoverColor: "group-hover:text-blue-600 dark:group-hover:text-blue-400",
    iconBg: "bg-blue-500/8 dark:bg-blue-500/5",
  },
  {
    label: "KEYBOARDS",
    title: "Keyboards",
    description: "Mechanical & Membrane",
    href: "/products/keyboards",
    count: "24+ Products",
    icon: (
      <Keyboard
        className="w-10 h-10 sm:w-16 lg:w-20 sm:h-16 lg:h-20 text-slate-600 dark:text-neutral-300"
        strokeWidth={1.2}
      />
    ),
    glowColor: "rgba(100,116,139,0.18)",
    hoverColor: "group-hover:text-slate-600 dark:group-hover:text-neutral-300",
    iconBg: "bg-slate-500/8 dark:bg-neutral-400/5",
  },
  {
    label: "AUDIO",
    title: "Audio & Sound",
    description: "Premium Sound Equipment",
    href: "/products/audio",
    count: "36+ Products",
    icon: (
      <Headphones
        className="w-10 h-10 sm:w-16 lg:w-20 sm:h-16 lg:h-20 text-rose-600"
        strokeWidth={1.2}
      />
    ),
    glowColor: "rgba(244,63,94,0.18)",
    hoverColor: "group-hover:text-rose-600 dark:group-hover:text-rose-450",
    iconBg: "bg-rose-500/8 dark:bg-rose-500/5",
  },
  {
    label: "SMARTPHONES",
    title: "Smartphones",
    description: "Flagships & Ecosystem Accessories",
    href: "/products/phones",
    count: "60+ Products",
    icon: (
      <Smartphone
        className="w-10 h-10 sm:w-16 lg:w-20 sm:h-16 lg:h-20 text-emerald-600"
        strokeWidth={1.2}
      />
    ),
    glowColor: "rgba(16,185,129,0.18)",
    hoverColor:
      "group-hover:text-emerald-600 dark:group-hover:text-emerald-400",
    iconBg: "bg-emerald-500/8 dark:bg-emerald-500/5",
  },
];

export default function CategoryBentoGrid({
  categories: customCategories,
}: {
  categories?: any[];
}) {
  // If custom categories are provided, map them to the 4 bento cards
  const activeCategories = [...categories];
  if (customCategories && customCategories.length >= 4) {
    // 0: Laptops
    activeCategories[0] = {
      ...categories[0],
      label: customCategories[0].name.toUpperCase(),
      title: customCategories[0].name,
      description:
        customCategories[0].description ||
        customCategories[0].tagline ||
        categories[0].description,
      href: `/products?category=${customCategories[0].slug}`,
      count: `${customCategories[0].productCount || 0}+ Products`,
    };
    // 1: Keyboards
    activeCategories[1] = {
      ...categories[1],
      label: customCategories[1].name.toUpperCase(),
      title: customCategories[1].name,
      description:
        customCategories[1].description ||
        customCategories[1].tagline ||
        categories[1].description,
      href: `/products?category=${customCategories[1].slug}`,
      count: `${customCategories[1].productCount || 0}+ Products`,
    };
    // 2: Audio
    activeCategories[2] = {
      ...categories[2],
      label: customCategories[2].name.toUpperCase(),
      title: customCategories[2].name,
      description:
        customCategories[2].description ||
        customCategories[2].tagline ||
        categories[2].description,
      href: `/products?category=${customCategories[2].slug}`,
      count: `${customCategories[2].productCount || 0}+ Products`,
    };
    // 3: Phones
    activeCategories[3] = {
      ...categories[3],
      label: customCategories[3].name.toUpperCase(),
      title: customCategories[3].name,
      description:
        customCategories[3].description ||
        customCategories[3].tagline ||
        categories[3].description,
      href: `/products?category=${customCategories[3].slug}`,
      count: `${customCategories[3].productCount || 0}+ Products`,
    };
  }

  const [laptops, keyboards, audio, phones] = activeCategories;

  return (
    <section className="w-full py-10 sm:py-16 lg:py-24 border-b border-border bg-zinc-50 dark:bg-neutral-950 text-foreground dark:text-white relative z-10 overflow-hidden">
      {/* Background Interactive Grid */}
      <div className="absolute inset-0 z-0 opacity-100 pointer-events-none w-full h-full">
        <InteractiveGridBackground
          className="w-full h-full"
          gridSize={48}
          darkGridColor="#161618"
          darkEffectColor="rgba(23, 62, 255, 0.25)"
          glow={true}
          glowRadius={15}
          showFade={true}
          fadeIntensity={10}
          fadeColor="bg-zinc-50 dark:bg-neutral-950"
        />
      </div>

      <div className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 relative z-10">
        {/* ── Section Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8 sm:mb-12">
          <div className="relative">
            {/* Decorative background word */}
            <span className="absolute -top-3 sm:-top-6 left-0 text-5xl sm:text-8xl font-black text-neutral-100 dark:text-white/[0.03] uppercase tracking-tight leading-none select-none pointer-events-none">
              EXPLORE
            </span>
            <span className="relative text-[10px] font-mono font-bold uppercase tracking-[0.3em] text-neutral-400 dark:text-neutral-500 block mb-2">
              Shop by Category
            </span>
            <h2 className="relative text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-neutral-900 dark:text-white uppercase leading-none">
              Browse Our{" "}
              <span className="text-blue-600 dark:text-blue-400">
                Collections
              </span>
            </h2>
          </div>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 text-sm font-bold text-neutral-400 dark:text-neutral-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-300 group shrink-0"
          >
            View All Categories
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>

        {/* ── Asymmetric Bento Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch">
          {/* Left Column — Laptops on top, Keyboards + Audio below */}
          <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-5">
            {/* Laptops Card (wide horizontal) */}
            <BentoCard
              card={laptops}
              heightClass="h-[130px] sm:h-[240px] lg:h-[280px]"
              wide
            >
              <div className="absolute top-0 right-0 h-full w-[45%] overflow-hidden flex items-center justify-center">
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 sm:w-48 sm:h-48 rounded-full blur-[35px] pointer-events-none group-hover:scale-125 transition-transform duration-700"
                  style={{
                    background: `radial-gradient(circle, ${laptops.glowColor} 0%, transparent 70%)`,
                  }}
                />
                <motion.div
                  variants={{
                    initial: { scale: 0.75, opacity: 0 },
                    animate: {
                      scale: 1,
                      opacity: 1,
                      transition: { duration: 0.55 },
                    },
                    hover: {
                      scale: 1.08,
                      y: -5,
                      transition: {
                        type: "spring",
                        stiffness: 260,
                        damping: 16,
                      },
                    },
                  }}
                  className="flex items-center justify-center"
                >
                  {laptops.icon}
                </motion.div>
              </div>
            </BentoCard>

            {/* Bottom row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              {/* Keyboards */}
              <BentoCard
                card={keyboards}
                heightClass="h-[130px] sm:h-[240px] lg:h-[280px]"
              >
                <div className="absolute right-4 bottom-4 sm:right-6 sm:bottom-6 lg:right-8 lg:bottom-8 select-none pointer-events-none">
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 sm:w-28 sm:h-28 rounded-full blur-[25px] pointer-events-none group-hover:scale-125 transition-transform duration-700"
                    style={{
                      background: `radial-gradient(circle, ${keyboards.glowColor} 0%, transparent 70%)`,
                    }}
                  />
                  <motion.div
                    variants={{
                      initial: { scale: 0.75, opacity: 0 },
                      animate: {
                        scale: 1,
                        opacity: 1,
                        transition: { duration: 0.55 },
                      },
                      hover: {
                        scale: 1.1,
                        transition: {
                          type: "spring",
                          stiffness: 260,
                          damping: 16,
                        },
                      },
                    }}
                  >
                    {keyboards.icon}
                  </motion.div>
                </div>
              </BentoCard>

              {/* Audio */}
              <BentoCard
                card={audio}
                heightClass="h-[130px] sm:h-[240px] lg:h-[280px]"
              >
                <div className="absolute right-4 bottom-4 sm:right-6 sm:bottom-6 lg:right-8 lg:bottom-8 select-none pointer-events-none">
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 sm:w-28 sm:h-28 rounded-full blur-[25px] pointer-events-none group-hover:scale-125 transition-transform duration-700"
                    style={{
                      background: `radial-gradient(circle, ${audio.glowColor} 0%, transparent 70%)`,
                    }}
                  />
                  <motion.div
                    variants={{
                      initial: { scale: 0.75, opacity: 0 },
                      animate: {
                        scale: 1,
                        opacity: 1,
                        transition: { duration: 0.55 },
                      },
                      hover: {
                        scale: [1, 1.08, 1],
                        transition: {
                          duration: 0.85,
                          repeat: Infinity,
                          ease: "easeInOut",
                        },
                      },
                    }}
                  >
                    {audio.icon}
                  </motion.div>
                </div>
              </BentoCard>
            </div>
          </div>

          {/* Right Column — Phones (full height) */}
          <div className="lg:col-span-4 h-full">
            <Link href={phones.href} className="group block h-full">
              <motion.div
                initial="initial"
                whileInView="animate"
                whileHover="hover"
                viewport={{ once: true, amount: 0.2 }}
                variants={{
                  initial: {
                    y: 0,
                    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
                  },
                  hover: {
                    y: -6,
                    boxShadow: "0 24px 30px -8px rgba(0,0,0,0.12)",
                  },
                }}
                transition={{ type: "spring", stiffness: 280, damping: 22 }}
                className="relative bg-white dark:bg-neutral-900 rounded-[24px] border border-neutral-200/70 dark:border-white/5 h-[130px] sm:h-full sm:min-h-[380px] lg:min-h-[580px] overflow-hidden p-5 sm:p-6 lg:p-8 flex flex-col justify-between transition-colors"
              >
                {/* Accent glow on hover */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[24px]"
                  style={{
                    background: `radial-gradient(circle at 50% 80%, ${phones.glowColor} 0%, transparent 65%)`,
                  }}
                />

                {/* Top colored accent line */}
                <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                {/* Content */}
                <div className="z-10 max-w-[55%] sm:max-w-none flex flex-col items-start">
                  {/* Product count badge */}
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-mono font-bold uppercase tracking-widest mb-2">
                    {phones.count}
                  </span>
                  <span className="font-mono text-[10px] tracking-widest text-neutral-400 dark:text-neutral-500 uppercase font-bold">
                    {phones.label}
                  </span>
                  <h3 className="text-lg sm:text-2xl font-black text-neutral-900 dark:text-white uppercase tracking-tight mt-1.5 sm:mt-2 leading-none">
                    {phones.title}
                  </h3>
                  <p className="text-[11px] sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1 sm:mt-2 leading-relaxed font-medium">
                    {phones.description}
                  </p>
                  <div
                    className={`inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 dark:text-neutral-500 ${phones.hoverColor} mt-3 sm:mt-6 transition-colors duration-300`}
                  >
                    <span>Shop Now</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </div>

                {/* Phone icon */}
                <div className="absolute right-4 bottom-4 sm:relative sm:right-0 sm:bottom-0 sm:flex-grow w-[35%] sm:w-full flex items-center justify-end sm:items-center sm:justify-center select-none pointer-events-none mt-0 sm:mt-6 h-[70px] sm:h-auto max-h-[50%] sm:max-h-[55%] md:max-h-[60%]">
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-44 sm:h-44 rounded-full blur-[30px] pointer-events-none group-hover:scale-125 transition-transform duration-700"
                    style={{
                      background: `radial-gradient(circle, ${phones.glowColor} 0%, transparent 70%)`,
                    }}
                  />
                  <motion.div
                    variants={{
                      initial: { scale: 0.75, opacity: 0 },
                      animate: {
                        scale: 1,
                        opacity: 1,
                        transition: { duration: 0.55 },
                      },
                      hover: {
                        scale: 1.08,
                        y: -6,
                        rotate: [0, -2, 2, -2, 0],
                        transition: {
                          y: { type: "spring", stiffness: 280, damping: 16 },
                          rotate: { duration: 0.45, ease: "easeInOut" },
                        },
                      },
                    }}
                    className="h-full w-full flex items-center justify-end sm:items-center sm:justify-center"
                  >
                    {phones.icon}
                  </motion.div>
                </div>
              </motion.div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Reusable Bento Card ──────────────────────────────────
interface BentoCardProps {
  card: CategoryCard;
  heightClass: string;
  wide?: boolean;
  children?: React.ReactNode;
}

function BentoCard({
  card,
  heightClass,
  wide = false,
  children,
}: BentoCardProps) {
  return (
    <Link href={card.href} className="group block">
      <motion.div
        initial="initial"
        whileInView="animate"
        whileHover="hover"
        viewport={{ once: true, amount: 0.2 }}
        variants={{
          initial: { y: 0, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" },
          hover: { y: -6, boxShadow: "0 24px 30px -8px rgba(0,0,0,0.12)" },
        }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
        className={`relative bg-white dark:bg-neutral-900 rounded-[24px] border border-neutral-200/70 dark:border-white/5 ${heightClass} overflow-hidden p-5 sm:p-6 lg:p-8 flex flex-col justify-between transition-colors`}
      >
        {/* Top accent glow line */}
        <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-current to-transparent opacity-0 group-hover:opacity-30 transition-opacity duration-500" />

        {/* Hover radial glow */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-[24px]"
          style={{
            background: `radial-gradient(circle at ${wide ? "30% 50%" : "70% 80%"}, ${card.glowColor} 0%, transparent 60%)`,
          }}
        />

        {/* Left text content */}
        <div
          className={`z-10 ${wide ? "max-w-[50%]" : "max-w-[60%]"} flex flex-col items-start`}
        >
          {/* Product count badge */}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 text-neutral-500 dark:text-neutral-400 text-[9px] font-mono font-bold uppercase tracking-widest mb-2">
            {card.count}
          </span>

          <span className="font-mono text-[10px] tracking-widest text-neutral-400 dark:text-neutral-500 uppercase font-bold">
            {card.label}
          </span>
          <h3
            className={`${wide ? "text-lg sm:text-2xl" : "text-lg sm:text-xl"} font-black text-neutral-900 dark:text-white uppercase tracking-tight mt-1.5 sm:mt-2 leading-none`}
          >
            {card.title}
          </h3>
          <p className="text-[11px] sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1 sm:mt-1.5 leading-relaxed font-medium">
            {card.description}
          </p>
          <div
            className={`inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 dark:text-neutral-500 ${card.hoverColor} mt-3 sm:mt-5 transition-colors duration-300`}
          >
            <span>Shop Now</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </div>
        </div>

        {children}
      </motion.div>
    </Link>
  );
}
