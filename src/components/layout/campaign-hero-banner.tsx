"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CampaignSlide {
  id: number;
  tag: string;
  title: string;
  description: string;
  ctaText: string;
  link: string;
  renderVisual: () => React.ReactNode;
}

const slides: CampaignSlide[] = [
  {
    id: 1,
    tag: "SPECIAL CAMPAIGN // BNPL",
    title: "BUY NOW. PAY IN 3. 0% INTEREST.",
    description: "Shop your favorite premium tech products today and split the bill into three interest-free monthly installments at checkout with Koko Pay.",
    ctaText: "Learn more about Koko split payments",
    link: "/coming-soon",
    renderVisual: () => (
      <div className="flex items-center gap-4 text-4xl sm:text-5xl font-mono font-black select-none opacity-20 tracking-tighter">
        <span className="text-blue-600">01</span>
        <span>/</span>
        <span>02</span>
        <span>/</span>
        <span>03</span>
      </div>
    ),
  },
  {
    id: 2,
    tag: "AUTHORISED DEALER // WARRANTY",
    title: "OFFICIAL MANUFACTURER WARRANTY.",
    description: "Shop with peace of mind. All hardware items are sourced directly from authorized channels and include official warranties and dedicated tech support.",
    ctaText: "View authorized brand partners",
    link: "/products?filter=brands",
    renderVisual: () => (
      <div className="flex flex-wrap gap-4 lg:gap-6 justify-center md:justify-end text-xs sm:text-sm font-mono font-bold text-muted-foreground/30 select-none max-w-xs md:max-w-md">
        <span className="font-sans font-black tracking-tighter">LOGITECH</span>
        <span className="font-mono font-extrabold tracking-widest">ANKER</span>
        <span className="font-sans font-light tracking-widest">APPLE</span>
        <span className="font-serif font-bold tracking-widest text-[11px]">SONY</span>
        <span className="font-mono font-bold italic">ASUS</span>
      </div>
    ),
  },
];

const AUTO_PLAY_TIME = 7500;

export default function CampaignHeroBanner() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 for prev, 1 for next
  const [isPlaying, setIsPlaying] = useState(true);

  const handleNext = useCallback(() => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  }, []);

  const handleDotClick = (index: number) => {
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  };

  // Autoplay
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      handleNext();
    }, AUTO_PLAY_TIME);

    return () => clearInterval(timer);
  }, [isPlaying, handleNext]);

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
        x: { type: "spring" as const, stiffness: 150, damping: 22 },
        opacity: { duration: 0.3 },
      },
    },
    exit: (dir: number) => ({
      x: dir > 0 ? "-100%" : "100%",
      opacity: 0,
      transition: {
        x: { type: "spring" as const, stiffness: 150, damping: 22 },
        opacity: { duration: 0.3 },
      },
    }),
  };

  return (
    <section
      className="relative w-full h-[260px] sm:h-[300px] md:h-[320px] bg-muted/5 border-b border-border overflow-hidden select-none z-10 flex items-center"
      onMouseEnter={() => setIsPlaying(false)}
      onMouseLeave={() => setIsPlaying(true)}
      aria-label="Campaign Promotion Banner"
    >
      {/* Background aesthetics fine lines */}
      <div className="absolute inset-0 grid grid-cols-4 pointer-events-none opacity-20 z-0">
        <div className="border-r border-border h-full" />
        <div className="border-r border-border h-full hidden sm:block" />
        <div className="border-r border-border h-full hidden lg:block" />
        <div className="h-full" />
      </div>

      {/* Slide frame wrapper */}
      <div className="relative w-full h-full">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="absolute inset-0 w-full h-full flex items-center z-10"
          >
            <div className="w-full max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 grid grid-cols-1 md:grid-cols-12 items-center gap-6">
              
              {/* Text content block */}
              <div className="col-span-1 md:col-span-8 flex flex-col justify-center items-start text-left max-w-2xl">
                
                {/* Monospace Campaign Badge */}
                <div className="mb-2">
                  <span className="font-mono text-[9px] sm:text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    {activeSlide.tag}
                  </span>
                </div>

                {/* Main Headline */}
                <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-foreground leading-tight mb-2.5 uppercase">
                  {activeSlide.title}
                </h1>

                {/* Subtitle Description */}
                <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed mb-4 max-w-xl">
                  {activeSlide.description}
                </p>

                {/* Digital Blue Arrow CTA */}
                <Link
                  href={activeSlide.link}
                  className="group inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                >
                  {activeSlide.ctaText}
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>

              </div>

              {/* Graphic/Brand Logotypes block (hidden on mobile/small screens) */}
              <div className="hidden md:flex md:col-span-4 items-center justify-end z-10">
                {activeSlide.renderVisual()}
              </div>

            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Center Pagination Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-30">
        {slides.map((slide, index) => {
          const isActive = index === currentIndex;
          return (
            <button
              key={slide.id}
              onClick={() => handleDotClick(index)}
              className={`h-1 rounded-full transition-all duration-300 focus:outline-none cursor-pointer ${
                isActive ? "bg-blue-600 w-5" : "bg-muted-foreground/30 w-1.5 hover:bg-muted-foreground/50"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          );
        })}
      </div>

    </section>
  );
}
