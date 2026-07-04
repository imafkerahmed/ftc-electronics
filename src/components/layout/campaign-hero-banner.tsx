"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CampaignSlide {
  id: number;
  eyebrow: string;
  titlePrefix: string;
  titleHighlight: string;
  highlightGradient: string;
  description: string;
  ctaText: string;
  ctaSecondary?: string;
  link: string;
  accentColor: string;
  blobColor1: string;
  blobColor2: string;
  renderVisual: () => React.ReactNode;
}

const slides: CampaignSlide[] = [
  {
    id: 1,
    eyebrow: "Zero Interest · 3 Easy Payments",
    titlePrefix: "BUY NOW.\n",
    titleHighlight: "PAY IN 3.\n0% INTEREST.",
    highlightGradient: "from-violet-600 via-indigo-500 to-cyan-500",
    description:
      "Shop your favorite premium tech today and split the cost into three interest-free monthly installments at checkout via Koko Pay.",
    ctaText: "Learn About Koko Pay",
    ctaSecondary: "Shop All",
    link: "/coming-soon",
    accentColor: "#6366f1",
    blobColor1: "rgba(99,102,241,0.18)",
    blobColor2: "rgba(139,92,246,0.12)",
    renderVisual: () => (
      <div className="relative w-full h-full flex items-center justify-center">
        <div className="relative w-[200px] h-[100px] sm:w-[300px] sm:h-[150px] md:w-[380px] md:h-[190px] lg:w-[440px] lg:h-[220px] flex items-center justify-center z-10">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-500/20 to-indigo-500/20 rounded-full blur-[60px] pointer-events-none scale-75 opacity-70" />
          <Image
            src="/assets/hero/Slider-Banner-Koko.png"
            alt="Koko Pay Split Payments"
            fill
            priority
            sizes="(max-width: 640px) 200px, (max-width: 1024px) 300px, 440px"
            className="object-contain filter drop-shadow-[0_20px_40px_rgba(99,102,241,0.3)] pointer-events-none select-none"
          />
        </div>
      </div>
    ),
  },
  {
    id: 2,
    eyebrow: "Authorized Distributor",
    titlePrefix: "OFFICIAL ",
    titleHighlight: "MANUFACTURER WARRANTY.",
    highlightGradient: "from-blue-600 to-sky-400",
    description:
      "Shop with total confidence. Every item is sourced directly from authorized channels and carries an official manufacturer warranty with dedicated tech support.",
    ctaText: "View Brand Partners",
    ctaSecondary: "Shop All Brands",
    link: "/products?filter=brands",
    accentColor: "#3b82f6",
    blobColor1: "rgba(59,130,246,0.18)",
    blobColor2: "rgba(56,189,248,0.12)",
    renderVisual: () => {
      const brands = [
        { name: "APPLE", desc: "Partner", bg: "bg-neutral-50" },
        { name: "LOGITECH", desc: "Gaming", bg: "bg-blue-50/60" },
        { name: "ANKER", desc: "Charging", bg: "bg-sky-50/60" },
        { name: "SONY", desc: "Audio", bg: "bg-indigo-50/60" },
        { name: "ASUS", desc: "Performance", bg: "bg-blue-50/60" },
      ];
      return (
        <div className="relative w-full h-full flex items-center justify-center">
          <div className="relative grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-[260px] sm:max-w-[340px] md:max-w-[400px] z-10 select-none pointer-events-none">
            <div className="absolute inset-0 bg-blue-500/8 rounded-full blur-[55px] pointer-events-none scale-75 opacity-60" />
            {brands.map((brand, i) => (
              <motion.div
                key={brand.name}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className={`relative flex flex-col items-center justify-center p-3 rounded-2xl ${brand.bg} border border-neutral-200/80 backdrop-blur-xs text-center shadow-sm`}
              >
                <span className="font-mono text-[9px] sm:text-xs font-black tracking-widest text-neutral-800">
                  {brand.name}
                </span>
                <span className="text-[6px] sm:text-[8px] text-neutral-500 mt-1 font-bold tracking-wider uppercase">
                  {brand.desc}
                </span>
              </motion.div>
            ))}
            <div className="relative flex flex-col items-center justify-center p-3 rounded-2xl bg-blue-50/50 border border-dashed border-blue-300/70 text-blue-600 text-center backdrop-blur-xs shadow-sm">
              <span className="font-mono font-black text-[8px] sm:text-[11px] tracking-wider">
                + MORE
              </span>
              <span className="text-[6px] sm:text-[8px] text-blue-500 mt-1 font-bold tracking-wider uppercase">
                Brands
              </span>
            </div>
          </div>
        </div>
      );
    },
  },
  {
    id: 3,
    eyebrow: "Premium Connectivity Brand",
    titlePrefix: "UNLEASH THE\nPOWER OF ",
    titleHighlight: "IVON.",
    highlightGradient: "from-cyan-500 to-teal-500",
    description:
      "Elevate your daily connectivity with IVON's premium chargers, armored data cables, and crystal-clear wireless audio — designed to charge fast and play clean.",
    ctaText: "Shop IVON Collection",
    ctaSecondary: "View All Cables",
    link: "/products?search=IVON",
    accentColor: "#0891b2",
    blobColor1: "rgba(6,182,212,0.18)",
    blobColor2: "rgba(20,184,166,0.12)",
    renderVisual: () => (
      <div className="relative w-full h-full flex items-center justify-center">
        <div className="relative w-[200px] h-[100px] sm:w-[300px] sm:h-[150px] md:w-[380px] md:h-[190px] lg:w-[440px] lg:h-[220px] flex items-center justify-center z-10">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/25 to-teal-500/25 rounded-full blur-[60px] pointer-events-none scale-75 opacity-80" />
          <Image
            src="/assets/hero/Slider-Banner-Ivon.png"
            alt="IVON Brand Logo"
            fill
            priority
            sizes="(max-width: 640px) 200px, (max-width: 1024px) 300px, 440px"
            className="object-contain filter drop-shadow-[0_20px_40px_rgba(6,182,212,0.3)] pointer-events-none select-none"
          />
        </div>
      </div>
    ),
  },
];

const AUTO_PLAY_TIME = 7500;

export default function CampaignHeroBanner() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);

  const handleNext = useCallback(() => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % slides.length);
    setProgress(0);
  }, []);

  const handlePrev = useCallback(() => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
    setProgress(0);
  }, []);

  const handleDotClick = (index: number) => {
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
    setProgress(0);
  };

  useEffect(() => {
    if (!isPlaying) return;
    const step = 50;
    const timer = setInterval(() => {
      setProgress((prev) => {
        const nextVal = prev + (step / AUTO_PLAY_TIME) * 100;
        if (nextVal >= 100) {
          handleNext();
          return 0;
        }
        return nextVal;
      });
    }, step);
    return () => clearInterval(timer);
  }, [isPlaying, handleNext]);

  const activeSlide = slides[currentIndex];

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? "6%" : "-6%",
      opacity: 0,
      filter: "blur(4px)",
    }),
    center: {
      x: "0%",
      opacity: 1,
      filter: "blur(0px)",
      transition: {
        x: { type: "spring" as const, stiffness: 200, damping: 28 },
        opacity: { duration: 0.4 },
        filter: { duration: 0.4 },
      },
    },
    exit: (dir: number) => ({
      x: dir > 0 ? "-6%" : "6%",
      opacity: 0,
      filter: "blur(4px)",
      transition: {
        x: { type: "spring" as const, stiffness: 200, damping: 28 },
        opacity: { duration: 0.3 },
        filter: { duration: 0.3 },
      },
    }),
  };

  return (
    <section
      className="relative w-full h-[520px] sm:h-[440px] md:h-[500px] lg:h-[560px] overflow-hidden select-none z-10 flex items-center border-b border-neutral-200/60"
      onMouseEnter={() => setIsPlaying(false)}
      onMouseLeave={() => setIsPlaying(true)}
      aria-label="Campaign Promotion Banner"
      style={{ background: "linear-gradient(135deg, #f8f9fc 0%, #f0f3f9 40%, #e8edf6 100%)" }}
    >
      {/* ── Animated gradient blob backgrounds ── */}
      <div
        className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full blur-[100px] pointer-events-none transition-all duration-1500 z-0 opacity-70"
        style={{ background: `radial-gradient(circle, ${activeSlide.blobColor1} 0%, transparent 70%)` }}
      />
      <div
        className="absolute bottom-0 left-0 w-[350px] h-[350px] rounded-full blur-[90px] pointer-events-none transition-all duration-1500 z-0 opacity-50"
        style={{ background: `radial-gradient(circle, ${activeSlide.blobColor2} 0%, transparent 70%)` }}
      />

      {/* ── Dot grid texture overlay ── */}
      <div
        className="absolute inset-0 z-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #000 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* ── Frosted glass overlay ── */}
      <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px] pointer-events-none z-[1]" />

      {/* ── Slide Content ── */}
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
            <div className="w-full max-w-7xl mx-auto px-6 sm:px-12 lg:px-20 grid grid-cols-1 sm:grid-cols-2 h-full items-center gap-6 sm:gap-10 lg:gap-16 py-10 sm:py-0">
              {/* ── Left: Text Content ── */}
              <div className="w-full flex flex-col justify-center items-start text-left order-2 sm:order-1 max-w-xl z-10">
                {/* Main Headline */}
                <motion.h1
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.4 }}
                  className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-neutral-900 leading-[1.05] mb-4 uppercase whitespace-pre-line"
                >
                  {activeSlide.titlePrefix}
                  <span
                    className={`bg-gradient-to-r ${activeSlide.highlightGradient} bg-clip-text text-transparent`}
                  >
                    {activeSlide.titleHighlight}
                  </span>
                </motion.h1>

                {/* Description */}
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="text-neutral-500 text-xs sm:text-sm leading-relaxed mb-6 max-w-md font-medium line-clamp-3 sm:line-clamp-none"
                >
                  {activeSlide.description}
                </motion.p>

                {/* CTA Buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.4 }}
                  className="flex items-center gap-3 flex-wrap"
                >
                  {/* Primary CTA */}
                  <Link
                    href={activeSlide.link}
                    className="group relative overflow-hidden inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm transition-all duration-300 cursor-pointer shadow-lg hover:shadow-xl active:scale-[0.98]"
                    style={{
                      background: `linear-gradient(135deg, ${activeSlide.accentColor} 0%, ${activeSlide.accentColor}cc 100%)`,
                      boxShadow: `0 8px 28px -6px ${activeSlide.accentColor}55`,
                    }}
                  >
                    <span className="absolute inset-0 bg-white/15 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    <span className="relative z-10 flex items-center gap-2">
                      {activeSlide.ctaText}
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  </Link>

                  {/* Secondary CTA */}
                  {activeSlide.ctaSecondary && (
                    <Link
                      href="/products"
                      className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-neutral-500 hover:text-neutral-800 transition-colors duration-200 group"
                    >
                      {activeSlide.ctaSecondary}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  )}
                </motion.div>
              </div>

              {/* ── Right: Visual Block ── */}
              <div className="w-full flex items-center justify-center order-1 sm:order-2 relative h-[140px] sm:h-full">
                {activeSlide.renderVisual()}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Left / Right Edge Navigation ── */}
      <button
        onClick={handlePrev}
        className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 z-30 h-11 w-11 rounded-full border border-neutral-200/70 bg-white/70 hover:bg-white/90 backdrop-blur-md text-neutral-700 items-center justify-center cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg"
        aria-label="Previous Slide"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        onClick={handleNext}
        className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 z-30 h-11 w-11 rounded-full border border-neutral-200/70 bg-white/70 hover:bg-white/90 backdrop-blur-md text-neutral-700 items-center justify-center cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95 shadow-lg"
        aria-label="Next Slide"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* ── Slide Pagination Dots ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-35">
        {/* Dots */}
        <div className="flex items-center gap-1.5">
          {slides.map((slide, index) => {
            const isActive = index === currentIndex;
            return (
              <button
                key={slide.id}
                onClick={() => handleDotClick(index)}
                className={`h-1.5 rounded-full transition-all duration-500 focus:outline-none cursor-pointer ${
                  isActive ? "w-8" : "w-1.5 bg-black/15 hover:bg-black/30"
                }`}
                style={{
                  backgroundColor: isActive ? activeSlide.accentColor : undefined,
                  boxShadow: isActive ? `0 0 10px ${activeSlide.accentColor}` : undefined,
                }}
                aria-label={`Go to slide ${index + 1}`}
              />
            );
          })}
        </div>
      </div>

      {/* ── Autoplay Progress Bar ── */}
      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-black/5 z-30 overflow-hidden">
        <div
          className="h-full transition-all duration-75 ease-linear"
          style={{
            width: `${progress}%`,
            backgroundColor: activeSlide.accentColor,
            boxShadow: `0 0 10px 1px ${activeSlide.accentColor}`,
          }}
        />
      </div>
    </section>
  );
}
