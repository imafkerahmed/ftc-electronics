"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import LiquidEther from "@/components/ui/LiquidEther/LiquidEther";

interface CampaignSlide {
  id: number;
  titlePrefix: string;
  titleHighlight: string;
  highlightGradient: string;
  description: string;
  ctaText: string;
  link: string;
  accentColor: string;
  renderVisual: () => React.ReactNode;
}

const slides: CampaignSlide[] = [
  {
    id: 1,
    titlePrefix: "BUY NOW. ",
    titleHighlight: "PAY IN 3. 0% INTEREST.",
    highlightGradient: "from-violet-600 via-indigo-600 to-cyan-600",
    description:
      "Shop your favorite premium tech products today and split the bill into three interest-free monthly installments at checkout with Koko Pay.",
    ctaText: "Learn more about Koko split payments",
    link: "/coming-soon",
    accentColor: "#6366f1",
    renderVisual: () => (
      <div className="relative w-full h-full flex items-center justify-center">
        <motion.div
          className="relative w-[190px] h-[95px] sm:w-[270px] sm:h-[135px] md:w-[320px] md:h-[160px] lg:w-[360px] lg:h-[180px] flex items-center justify-center z-10"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-violet-500/20 to-indigo-500/20 rounded-full blur-[40px] pointer-events-none scale-75 opacity-60" />
          <Image
            src="/assets/hero/Slider-Banner-Koko.png"
            alt="Koko Pay Split Payments"
            fill
            priority
            sizes="(max-width: 640px) 190px, (max-width: 1024px) 270px, 360px"
            className="object-contain filter drop-shadow-[0_12px_24px_rgba(99,102,241,0.25)] pointer-events-none select-none"
          />
        </motion.div>
      </div>
    ),
  },
  {
    id: 2,
    titlePrefix: "OFFICIAL ",
    titleHighlight: "MANUFACTURER WARRANTY.",
    highlightGradient: "from-blue-600 to-sky-500",
    description:
      "Shop with peace of mind. All hardware items are sourced directly from authorized channels and include official warranties and dedicated tech support.",
    ctaText: "View authorized brand partners",
    link: "/products?filter=brands",
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
        <div className="relative w-full h-full flex items-center justify-center">
          <motion.div
            className="relative grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-[240px] sm:max-w-[320px] md:max-w-[360px] z-10 select-none pointer-events-none"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="absolute inset-0 bg-blue-500/5 rounded-full blur-[45px] pointer-events-none scale-75 opacity-55" />
            {brands.map((brand, i) => (
              <motion.div
                key={brand.name}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className="relative flex flex-col items-center justify-center p-2.5 rounded-xl sm:rounded-2xl bg-white/60 border border-neutral-200/80 backdrop-blur-xs text-center shadow-xs"
              >
                <span className="font-mono text-[9px] sm:text-xs font-black tracking-widest text-neutral-800">
                  {brand.name}
                </span>
                <span className="text-[6px] sm:text-[8px] text-neutral-500 mt-1 font-bold tracking-wider uppercase">
                  {brand.desc}
                </span>
              </motion.div>
            ))}
            <div className="relative flex flex-col items-center justify-center p-2.5 rounded-xl sm:rounded-2xl bg-blue-50/40 border border-dashed border-blue-300/60 text-blue-600 text-center animate-pulse backdrop-blur-xs shadow-xs">
              <span className="font-mono font-black text-[8px] sm:text-[10px] tracking-wider">
                + MORE
              </span>
              <span className="text-[6px] sm:text-[8px] text-blue-500 mt-1 font-bold tracking-wider uppercase">
                Brands
              </span>
            </div>
          </motion.div>
        </div>
      );
    },
  },
  {
    id: 3,
    titlePrefix: "UNLEASH THE POWER OF ",
    titleHighlight: "IVON.",
    highlightGradient: "from-cyan-600 to-teal-650",
    description:
      "Elevate your daily connectivity with IVON's premium chargers, armored data cables, and crystal-clear wireless audio. Designed to charge fast and play clean.",
    ctaText: "Shop IVON Collection",
    link: "/products?search=IVON",
    accentColor: "#0891b2",
    renderVisual: () => (
      <div className="relative w-full h-full flex items-center justify-center">
        <motion.div
          className="relative w-[190px] h-[95px] sm:w-[270px] sm:h-[135px] md:w-[320px] md:h-[160px] lg:w-[360px] lg:h-[180px] flex items-center justify-center z-10"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/25 to-teal-500/25 rounded-full blur-[50px] pointer-events-none scale-75 opacity-70" />
          <Image
            src="/assets/hero/Slider-Banner-Ivon.png"
            alt="IVON Brand Logo"
            fill
            priority
            sizes="(max-width: 640px) 190px, (max-width: 1024px) 270px, 360px"
            className="object-contain filter drop-shadow-[0_12px_24px_rgba(6,182,212,0.25)] pointer-events-none select-none"
          />
        </motion.div>
      </div>
    ),
  },
];

const AUTO_PLAY_TIME = 7500;
const DISSOLVING_COLORS = ["#6366f1", "#a855f7", "#3b82f6", "#06b6d4"];

interface Particle {
  id: number;
  left: string;
  top: string;
  size: number;
  delay: number;
  duration: number;
}

export default function CampaignHeroBanner() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 for prev, 1 for next
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Generate stardust nodes on client mount to avoid hydration mismatch
    const generated = Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 80 + 10}%`,
      size: Math.random() * 1.8 + 1.2, // 1.2px to 3px
      delay: Math.random() * 6,
      duration: Math.random() * 6 + 6, // 6s to 12s
    }));
    setParticles(generated);
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
      className="relative w-full h-[450px] sm:h-[350px] md:h-[320px] lg:h-[340px] bg-gradient-to-br from-[#f8f9fc] via-[#f1f3f9] to-[#e8ecf4] text-neutral-900 overflow-hidden select-none z-10 flex items-center transition-all duration-1000 border-b border-neutral-200/60"
      onMouseEnter={() => setIsPlaying(false)}
      onMouseLeave={() => setIsPlaying(true)}
      aria-label="Campaign Promotion Banner"
    >
      {/* 1. Interactive Liquid Ether WebGL Background */}
      <div className="absolute inset-0 z-0 opacity-65 pointer-events-none transition-opacity duration-1000">
        {mounted && (
          <LiquidEther 
            colors={DISSOLVING_COLORS} 
            mouseForce={16}
            cursorSize={85}
            autoDemo={true}
            autoSpeed={0.35}
            autoIntensity={1.8}
          />
        )}
      </div>

      {/* 2. Frosted Liquid Glass overlay (Blur diffuse layer) */}
      <div className="absolute inset-0 bg-white/45 backdrop-blur-[30px] pointer-events-none z-[1]" />

      {/* 3. Atmospheric Background Drifting Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-[2]">
        {mounted &&
          particles.map((p) => (
            <motion.div
              key={p.id}
              className="absolute rounded-full bg-blue-500/20"
              style={{
                left: p.left,
                top: p.top,
                width: p.size,
                height: p.size,
              }}
              animate={{
                y: [0, -120],
                opacity: [0, 0.4, 0],
              }}
              transition={{
                duration: p.duration,
                repeat: Infinity,
                delay: p.delay,
                ease: "linear",
              }}
            />
          ))}
      </div>

      {/* 4. Dynamic ambient backing glow matching active slide */}
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2 w-[300px] h-[300px] sm:w-[480px] sm:h-[480px] rounded-full blur-[100px] pointer-events-none transition-all duration-1000 z-[2]"
        style={{
          background: `radial-gradient(circle, ${activeSlide.accentColor}1c 0%, transparent 70%)`,
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
            <div className="w-full max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 grid grid-cols-1 sm:grid-cols-2 h-full items-center gap-4 sm:gap-12 lg:gap-16 py-8 sm:py-0">
              {/* Text Content Block */}
              <div className="w-full flex flex-col justify-center items-start text-left order-2 sm:order-1 max-w-lg z-10">
                {/* Main Headline */}
                <h1 className="text-lg sm:text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight text-neutral-900 leading-tight mb-2.5 sm:mb-4 uppercase">
                  {activeSlide.titlePrefix}
                  <span className={`bg-gradient-to-r ${activeSlide.highlightGradient} bg-clip-text text-transparent`}>
                    {activeSlide.titleHighlight}
                  </span>
                </h1>

                {/* Description */}
                <p className="text-neutral-600 text-[11px] sm:text-sm leading-relaxed mb-4.5 sm:mb-7 max-w-md font-medium line-clamp-2 sm:line-clamp-none">
                  {activeSlide.description}
                </p>

                {/* Interactive Premium Styled CTA Button */}
                <Link
                  href={activeSlide.link}
                  className="group relative z-10 overflow-hidden inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm transition-all duration-300 cursor-pointer shadow-md hover:shadow-lg active:scale-98"
                  style={{
                    background: `linear-gradient(135deg, ${activeSlide.accentColor} 0%, ${activeSlide.accentColor}dd 100%)`,
                    boxShadow: `0 8px 25px -4px ${activeSlide.accentColor}44`,
                  }}
                >
                  <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="relative z-10 flex items-center gap-2">
                    {activeSlide.ctaText}
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>
              </div>

              {/* Graphic Visual Block */}
              <div className="w-full flex items-center justify-center order-1 sm:order-2 relative h-[120px] sm:h-full">
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
          className="h-10 w-10 rounded-full border border-neutral-200 bg-white/60 hover:bg-white/80 backdrop-blur-md text-neutral-800 flex items-center justify-center cursor-pointer pointer-events-auto transition-all duration-355 hover:scale-108 active:scale-95 shadow-md"
          aria-label="Previous Slide"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={handleNext}
          className="h-10 w-10 rounded-full border border-neutral-200 bg-white/60 hover:bg-white/80 backdrop-blur-md text-neutral-800 flex items-center justify-center cursor-pointer pointer-events-auto transition-all duration-355 hover:scale-108 active:scale-95 shadow-md"
          aria-label="Next Slide"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Slide Pagination Dots */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 z-35">
        {slides.map((slide, index) => {
          const isActive = index === currentIndex;
          return (
            <button
              key={slide.id}
              onClick={() => handleDotClick(index)}
              className={`h-2 rounded-full transition-all duration-500 focus:outline-none cursor-pointer ${
                isActive 
                  ? "w-8 shadow-xs animate-none" 
                  : "w-2 bg-black/15 hover:bg-black/30"
              }`}
              style={{
                backgroundColor: isActive ? activeSlide.accentColor : undefined,
                boxShadow: isActive ? `0 0 12px ${activeSlide.accentColor}` : undefined
              }}
              aria-label={`Go to slide ${index + 1}`}
            />
          );
        })}
      </div>

      {/* Bottom Autoplay Progress Bar */}
      <div className="absolute bottom-0 left-0 w-full h-[1.5px] bg-black/5 z-30 overflow-hidden">
        <div
          className="h-full transition-all duration-75 ease-linear"
          style={{
            width: `${progress}%`,
            backgroundColor: activeSlide.accentColor,
            boxShadow: `0 0 8px 1px ${activeSlide.accentColor}`,
          }}
        />
      </div>
    </section>
  );
}
