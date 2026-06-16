"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "motion/react";
import { FloatingPaths } from "@/components/ui/background-paths";

interface CampaignSlide {
  id: number;
  tag: string;
  title: string;
  description: string;
  ctaText: string;
  link: string;
  titleGradientClass: string;
  rightGlowGradient: string;
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
    titleGradientClass: "from-[#0055ff] via-[#7b2cbf] to-[#ff007f] dark:from-[#00d2ff] dark:via-[#9d4edd] dark:to-[#ff00aa]",
    rightGlowGradient: "from-cyan-500/20 via-violet-500/25 to-transparent dark:from-cyan-500/15 dark:via-violet-500/20 dark:to-transparent",
    renderVisual: () => (
      <motion.div 
        className="relative w-[220px] h-[160px] sm:w-[300px] sm:h-[220px] md:w-[360px] md:h-[240px] flex items-center justify-end z-10"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <Image
          src="/assets/hero/Slider-Banner-Koko.png"
          alt="Koko Pay Split Payments"
          fill
          priority
          sizes="(max-width: 768px) 300px, 400px"
          className="object-contain filter drop-shadow-[0_10px_30px_rgba(123,44,191,0.25)] pointer-events-none"
        />
      </motion.div>
    ),
  },
  {
    id: 2,
    tag: "AUTHORISED DEALER // WARRANTY",
    title: "OFFICIAL MANUFACTURER WARRANTY.",
    description: "Shop with peace of mind. All hardware items are sourced directly from authorized channels and include official warranties and dedicated tech support.",
    ctaText: "View authorized brand partners",
    link: "/products?filter=brands",
    titleGradientClass: "from-neutral-900 via-neutral-850 to-neutral-700 dark:from-white dark:via-zinc-300 dark:to-zinc-500",
    rightGlowGradient: "from-blue-500/15 via-indigo-500/10 to-transparent dark:from-blue-500/10 dark:via-indigo-500/5 dark:to-transparent",
    renderVisual: () => {
      const brands = [
        { name: "APPLE", desc: "Premium Partner", color: "hover:border-zinc-400 dark:hover:border-white/50" },
        { name: "LOGITECH", desc: "Gaming Gear", color: "hover:border-blue-500" },
        { name: "ANKER", desc: "Charging Power", color: "hover:border-teal-500" },
        { name: "SONY", desc: "Studio Acoustics", color: "hover:border-indigo-500" },
        { name: "ASUS", desc: "Pure Performance", color: "hover:border-red-500" }
      ];
      return (
        <div className="grid grid-cols-3 gap-3 w-full max-w-[340px] z-10">
          {brands.map((brand) => (
            <motion.div
              key={brand.name}
              whileHover={{ y: -4, scale: 1.03 }}
              className={`flex flex-col items-center justify-center p-3 rounded-xl bg-white/40 dark:bg-[#121217]/50 border border-neutral-200/50 dark:border-neutral-800/40 backdrop-blur-xs select-none shadow-xs transition-colors duration-300 ${brand.color}`}
            >
              <span className="font-sans font-black tracking-tighter text-neutral-800 dark:text-neutral-200 text-xs">
                {brand.name}
              </span>
              <span className="text-[8px] text-muted-foreground mt-0.5">
                {brand.desc}
              </span>
            </motion.div>
          ))}
          <motion.div
            whileHover={{ y: -4, scale: 1.03 }}
            className="flex flex-col items-center justify-center p-3 rounded-xl bg-blue-600/5 dark:bg-blue-500/5 border border-dashed border-blue-600/30 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 cursor-pointer"
          >
            <span className="font-mono font-bold text-[9px] tracking-wider uppercase">
              + MORE
            </span>
            <span className="text-[8px] text-blue-600/70 dark:text-blue-400/70 mt-0.5">
              Partners
            </span>
          </motion.div>
        </div>
      );
    },
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

  const handleDotClick = (index: number) => {
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  };

  // Autoplay & progress management
  useEffect(() => {
    if (!isPlaying) return;

    const step = 50; // Update every 50ms
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

  // Handle slide transition when progress reaches 100
  useEffect(() => {
    if (progress >= 100) {
      handleNext();
      setProgress(0);
    }
  }, [progress, handleNext]);

  // Reset progress when index changes
  useEffect(() => {
    setProgress(0);
  }, [currentIndex]);

  const activeSlide = slides[currentIndex];

  // Mouse tilt tracking variables
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);

  const springConfig = { stiffness: 100, damping: 20 };
  const rotateX = useSpring(useTransform(y, [0, 1], [10, -10]), springConfig);
  const rotateY = useSpring(useTransform(x, [0, 1], [-10, 10]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = (e.clientX - rect.left) / width;
    const mouseY = (e.clientY - rect.top) / height;

    x.set(mouseX);
    y.set(mouseY);
  };

  const handleMouseLeave = () => {
    x.set(0.5);
    y.set(0.5);
    setIsPlaying(true);
  };

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
      className="relative w-full h-[280px] sm:h-[320px] md:h-[340px] bg-gradient-to-br from-white via-zinc-50 to-neutral-100 dark:from-[#0B0B0F] dark:via-neutral-950 dark:to-[#0B0B0F] border-b border-border overflow-hidden select-none z-10 flex items-center"
      onMouseEnter={() => setIsPlaying(false)}
      onMouseLeave={handleMouseLeave}
      aria-label="Campaign Promotion Banner"
    >
      {/* Floating Animated paths in the background (lowered opacity for elegance) */}
      <div className="absolute inset-0 z-0 opacity-35 dark:opacity-20 pointer-events-none">
        {mounted && <FloatingPaths position={1} />}
      </div>

      {/* Right side ambient radial glow behind visuals */}
      <div 
        className={`absolute right-0 top-1/2 -translate-y-1/2 w-[320px] h-[320px] sm:w-[450px] sm:h-[450px] rounded-full blur-[80px] sm:blur-[130px] pointer-events-none bg-gradient-to-br ${activeSlide.rightGlowGradient} transition-all duration-1000 opacity-90 sm:opacity-85 z-0`}
      />

      {/* Background grid fine lines */}
      <div className="absolute inset-0 grid grid-cols-4 pointer-events-none opacity-20 z-0">
        <div className="border-r border-border h-full" />
        <div className="border-r border-border h-full hidden sm:block" />
        <div className="border-r border-border h-full hidden lg:block" />
        <div className="h-full" />
      </div>

      {/* Slide frame wrapper */}
      <div className="relative w-full h-full z-10">
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
                

                {/* Main Headline with Premium Gradient */}
                <h1 className={`text-xl sm:text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r ${activeSlide.titleGradientClass} bg-clip-text text-transparent leading-none mb-3.5 uppercase`}>
                  {activeSlide.title}
                </h1>

                {/* Subtitle Description */}
                <p className="text-muted-foreground text-xs sm:text-sm md:text-base leading-relaxed mb-6 max-w-xl font-medium">
                  {activeSlide.description}
                </p>

                {/* Interactive Premium Styled CTA Button */}
                <Link
                  href={activeSlide.link}
                  className="group inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/10 hover:bg-blue-600 text-blue-600 hover:text-white dark:bg-blue-500/10 dark:hover:bg-blue-500 dark:text-blue-400 dark:hover:text-white font-bold text-xs sm:text-sm transition-all duration-300 border border-blue-600/20 hover:border-blue-600 dark:border-blue-500/20 dark:hover:border-blue-500 shadow-xs cursor-pointer"
                >
                  {activeSlide.ctaText}
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>

              </div>

              {/* Graphic/Brand Logotypes block (hidden on mobile/small screens) */}
              <div 
                className="hidden md:flex md:col-span-4 items-center justify-end z-10 h-full w-full"
                onMouseMove={handleMouseMove}
              >
                <motion.div
                  style={{
                    rotateX,
                    rotateY,
                    transformStyle: "preserve-3d",
                  }}
                  className="w-full flex justify-end"
                >
                  {activeSlide.renderVisual()}
                </motion.div>
              </div>

            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Center Pagination Dots */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-30">
        {slides.map((slide, index) => {
          const isActive = index === currentIndex;
          return (
            <button
              key={slide.id}
              onClick={() => handleDotClick(index)}
              className={`h-1.5 rounded-full transition-all duration-300 focus:outline-none cursor-pointer ${
                isActive ? "bg-blue-600 w-5" : "bg-muted-foreground/30 w-1.5 hover:bg-muted-foreground/50"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          );
        })}
      </div>

      {/* Auto-running Bottom Progress Bar */}
      <div className="absolute bottom-0 left-0 w-full h-[3px] bg-zinc-200 dark:bg-zinc-800/60 z-30 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

    </section>
  );
}
