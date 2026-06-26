"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { FloatingPaths } from "@/components/ui/background-paths";

interface CampaignSlide {
  id: number;
  tag: string;
  title: string;
  description: string;
  ctaText: string;
  link: string;
  gradientClass: string;
  glowColor: string;
  accentColor: string;
  renderVisual: () => React.ReactNode;
}

const slides: CampaignSlide[] = [
  {
    id: 1,
    tag: "SPECIAL CAMPAIGN // BNPL",
    title: "BUY NOW. PAY IN 3. 0% INTEREST.",
    description:
      "Shop your favorite premium tech products today and split the bill into three interest-free monthly installments at checkout with Koko Pay.",
    ctaText: "Learn more about Koko split payments",
    link: "/coming-soon",
    gradientClass: "from-white via-violet-50/15 to-violet-100/35 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/80",
    glowColor: "rgba(99, 102, 241, 0.08)", // Indigo
    accentColor: "#6366f1",
    renderVisual: () => (
      <motion.div
        className="relative w-[180px] h-[80px] sm:w-[260px] sm:h-[160px] md:w-[320px] md:h-[200px] lg:w-[380px] lg:h-[240px] flex items-center justify-center z-10"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Image
          src="/assets/hero/Slider-Banner-Koko.png"
          alt="Koko Pay Split Payments"
          fill
          priority
          sizes="(max-width: 640px) 180px, (max-width: 1024px) 260px, 380px"
          className="object-contain filter drop-shadow-[0_10px_25px_rgba(99,102,241,0.15)] pointer-events-none"
        />
      </motion.div>
    ),
  },
  {
    id: 2,
    tag: "AUTHORISED DEALER // WARRANTY",
    title: "OFFICIAL MANUFACTURER WARRANTY.",
    description:
      "Shop with peace of mind. All hardware items are sourced directly from authorized channels and include official warranties and dedicated tech support.",
    ctaText: "View authorized brand partners",
    link: "/products?filter=brands",
    gradientClass: "from-white via-blue-50/15 to-blue-100/35 dark:from-zinc-950 dark:via-zinc-900 dark:to-neutral-900",
    glowColor: "rgba(59, 130, 246, 0.06)", // Blue
    accentColor: "#3b82f6",
    renderVisual: () => {
      const brands = [
        { name: "APPLE", desc: "Partner" },
        { name: "LOGITECH", desc: "Gaming" },
        { name: "ANKER", desc: "Charging" },
        { name: "SONY", desc: "Audio" },
        { name: "ASUS", desc: "Performance" },
      ];
      return (
        <div className="grid grid-cols-3 gap-2 w-full max-w-[240px] sm:max-w-[300px] md:max-w-[340px] z-10">
          {brands.map((brand) => (
            <motion.div
              key={brand.name}
              whileHover={{ y: -3, scale: 1.02 }}
              className="flex flex-col items-center justify-center p-2 rounded-xl bg-white dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 backdrop-blur-xs select-none shadow-xs text-center"
            >
              <span className="font-sans font-black tracking-tighter text-neutral-850 dark:text-white text-[10px] sm:text-xs">
                {brand.name}
              </span>
              <span className="text-[7px] sm:text-[9px] text-neutral-500 dark:text-zinc-400 mt-0.5 font-medium">
                {brand.desc}
              </span>
            </motion.div>
          ))}
          <motion.div
            whileHover={{ y: -3, scale: 1.02 }}
            className="flex flex-col items-center justify-center p-2 rounded-xl bg-blue-50/50 dark:bg-blue-500/10 border border-dashed border-blue-500/30 text-blue-600 dark:text-blue-400 cursor-pointer text-center animate-pulse"
          >
            <span className="font-mono font-bold text-[8px] sm:text-[10px] tracking-wider uppercase">
              + MORE
            </span>
            <span className="text-[7px] sm:text-[9px] text-blue-500/80 dark:text-blue-400/70 mt-0.5 font-medium">
              Brands
            </span>
          </motion.div>
        </div>
      );
    },
  },
  {
    id: 3,
    tag: "NEW BRAND // IVON",
    title: "UNLEASH THE POWER OF IVON.",
    description:
      "Elevate your daily connectivity with IVON's premium chargers, armored data cables, and crystal-clear wireless audio. Designed to charge fast and play clean.",
    ctaText: "Shop IVON Collection",
    link: "/products?search=IVON",
    gradientClass: "from-white via-cyan-50/15 to-cyan-100/30 dark:from-cyan-950 dark:via-zinc-950 dark:to-neutral-900",
    glowColor: "rgba(6, 182, 212, 0.08)", // Cyan
    accentColor: "#06b6d4",
    renderVisual: () => (
      <motion.div
        className="relative w-[100px] h-[100px] sm:w-[150px] sm:h-[150px] md:w-[180px] md:h-[180px] rounded-2xl p-3 bg-white border border-neutral-150 dark:border-neutral-800 shadow-md flex items-center justify-center overflow-hidden z-10"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="w-full h-full relative flex items-center justify-center bg-white rounded-xl overflow-hidden">
          <Image
            src="/assets/banners/IVON.jpeg"
            alt="IVON Brand Logo"
            fill
            className="object-contain p-1.5"
            sizes="(max-width: 640px) 100px, 180px"
            priority
          />
        </div>
      </motion.div>
    ),
  },
];

const AUTO_PLAY_TIME = 7500;

export default function CampaignHeroBanner() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 for prev, 1 for next
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleNext = useCallback(() => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  }, []);

  const handlePrev = useCallback(() => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  }, []);

  const handleDotClick = (index: number) => {
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  };

  // Autoplay progress bar logic
  useEffect(() => {
    if (!isPlaying) return;

    const step = 50;
    const timer = setInterval(() => {
      setProgress((prev) => {
        const nextVal = prev + (step / AUTO_PLAY_TIME) * 100;
        if (nextVal >= 100) {
          return 100;
        }
        return nextVal;
      });
    }, step);

    return () => clearInterval(timer);
  }, [isPlaying]);

  useEffect(() => {
    if (progress >= 100) {
      handleNext();
      setProgress(0);
    }
  }, [progress, handleNext]);

  useEffect(() => {
    setProgress(0);
  }, [currentIndex]);

  const activeSlide = slides[currentIndex];

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? "100%" : "-100%",
      opacity: 0,
    }),
    center: {
      x: "0%",
      opacity: 1,
      transition: {
        x: { type: "spring" as const, stiffness: 120, damping: 20 },
        opacity: { duration: 0.35 },
      },
    },
    exit: (dir: number) => ({
      x: dir > 0 ? "-100%" : "100%",
      opacity: 0,
      transition: {
        x: { type: "spring" as const, stiffness: 120, damping: 20 },
        opacity: { duration: 0.35 },
      },
    }),
  };

  return (
    <section
      className={`relative w-full h-[360px] sm:h-[340px] md:h-[300px] lg:h-[320px] bg-gradient-to-br ${activeSlide.gradientClass} overflow-hidden select-none z-10 flex items-center transition-all duration-1000 border-b border-border`}
      onMouseEnter={() => setIsPlaying(false)}
      onMouseLeave={() => setIsPlaying(true)}
      aria-label="Campaign Promotion Banner"
    >
      {/* Floating Animated paths in the background (lowered opacity for elegance) */}
      <div className="absolute inset-0 z-0 opacity-25 dark:opacity-20 pointer-events-none">
        {mounted && <FloatingPaths position={1} />}
      </div>

      {/* Ambient radial glow behind visuals */}
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 w-[280px] h-[280px] sm:w-[450px] sm:h-[450px] rounded-full blur-[80px] sm:blur-[120px] pointer-events-none opacity-90 dark:opacity-85 z-0 transition-all duration-1000"
        style={{
          background: `radial-gradient(circle, ${activeSlide.glowColor} 0%, transparent 70%)`,
        }}
      />

      <div className="relative w-full h-full z-10 flex items-center">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0 w-full h-full flex items-center"
          >
            <div className="w-full max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 grid grid-cols-1 sm:grid-cols-2 h-full items-center gap-6 sm:gap-12 lg:gap-16">
              {/* Text Content Block */}
              <div className="w-full flex flex-col justify-center items-start text-left order-2 sm:order-1 max-w-lg z-10">
                {/* Slide Monospace Tag */}
                <div className="mb-3">
                  <span className="font-mono text-[9px] font-bold tracking-widest text-neutral-500 dark:text-white/50 border border-neutral-250 dark:border-white/10 px-2.5 py-0.5 rounded-md bg-neutral-100/50 dark:bg-white/5 uppercase">
                    {activeSlide.tag}
                  </span>
                </div>

                {/* Main Headline */}
                <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-white leading-tight mb-3.5 uppercase">
                  {activeSlide.title}
                </h1>

                {/* Description */}
                <p className="text-neutral-600 dark:text-white/70 text-xs sm:text-sm leading-relaxed mb-5 sm:mb-6 max-w-md font-medium">
                  {activeSlide.description}
                </p>

                {/* Interactive Premium Styled CTA Button */}
                <Link
                  href={activeSlide.link}
                  className="group relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white/10 dark:hover:bg-white dark:text-white dark:hover:text-neutral-950 font-bold text-xs sm:text-sm transition-all duration-300 border border-neutral-900 dark:border-white/20 shadow-xs cursor-pointer"
                >
                  {activeSlide.ctaText}
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </div>

              {/* Graphic Visual Block */}
              <div className="w-full flex items-center justify-start sm:justify-center order-1 sm:order-2 relative h-[140px] sm:h-full">
                {activeSlide.renderVisual()}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Manual Left & Right Navigation Arrows */}
      <div className="hidden sm:flex absolute top-1/2 -translate-y-1/2 left-6 right-6 justify-between pointer-events-none z-30">
        <button
          onClick={handlePrev}
          className="h-9 w-9 rounded-full border border-neutral-200 dark:border-white/10 bg-white/80 dark:bg-white/5 hover:bg-neutral-50 dark:hover:bg-white/15 backdrop-blur-xs text-neutral-600 dark:text-white flex items-center justify-center cursor-pointer pointer-events-auto transition-all duration-200 hover:scale-105 shadow-xs"
          aria-label="Previous Slide"
        >
          <ChevronLeft className="h-4.5 w-4.5" />
        </button>
        <button
          onClick={handleNext}
          className="h-9 w-9 rounded-full border border-neutral-200 dark:border-white/10 bg-white/80 dark:bg-white/5 hover:bg-neutral-50 dark:hover:bg-white/15 backdrop-blur-xs text-neutral-600 dark:text-white flex items-center justify-center cursor-pointer pointer-events-auto transition-all duration-200 hover:scale-105 shadow-xs"
          aria-label="Next Slide"
        >
          <ChevronRight className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Slide Pagination Dots */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-35">
        {slides.map((slide, index) => {
          const isActive = index === currentIndex;
          return (
            <button
              key={slide.id}
              onClick={() => handleDotClick(index)}
              className={`h-1.5 rounded-full transition-all duration-300 focus:outline-none cursor-pointer ${
                isActive ? "bg-neutral-800 dark:bg-white w-5" : "bg-neutral-200 dark:bg-white/20 w-1.5 hover:bg-neutral-350 dark:hover:bg-white/40"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          );
        })}
      </div>

      {/* Bottom Autoplay Progress Bar */}
      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-neutral-200 dark:bg-white/10 z-30 overflow-hidden">
        <div
          className="h-full transition-all duration-75 ease-linear"
          style={{
            width: `${progress}%`,
            backgroundColor: activeSlide.accentColor,
          }}
        />
      </div>
    </section>
  );
}
