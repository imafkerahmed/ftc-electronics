"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Card } from "@/components/ui/card";

interface Slide {
  id: number;
  badge: string;
  title: string;
  description: string;
  price: string;
  image: string;
  link: string;
  gradient: string;
  glowColor: string;
  accentColor: string;
}

const slides: Slide[] = [
  {
    id: 1,
    badge: "CREATOR STATION",
    title: "Zenith Pro 16 Laptops",
    description: "M3 Max Pro speed meets a breathtaking 240Hz OLED color-accurate display.",
    price: "$1,899",
    image: "/assets/hero-laptop.png",
    link: "/products?category=laptops",
    gradient: "from-slate-950 via-slate-900 to-zinc-900",
    glowColor: "rgba(59, 130, 246, 0.12)", // Blue
    accentColor: "#3b82f6",
  },
  {
    id: 2,
    badge: "STUDIO FIDELITY",
    title: "Auralux ANC Headphones",
    description: "Experience pure hybrid noise-cancelling acoustics designed for ultimate focus.",
    price: "$349",
    image: "/assets/hero-headphones.png",
    link: "/products?category=audio",
    gradient: "from-zinc-950 via-neutral-900 to-slate-950",
    glowColor: "rgba(139, 92, 246, 0.12)", // Violet
    accentColor: "#8b5cf6",
  },
  {
    id: 3,
    badge: "MECHANICAL BEAST",
    title: "Matrix-87 Keyboards",
    description: "Custom gasket mounted chassis combined with ultra-responsive transparent switches.",
    price: "$189",
    image: "/assets/hero-keyboard.png",
    link: "/products?category=accessories",
    gradient: "from-neutral-950 via-zinc-900 to-neutral-900",
    glowColor: "rgba(245, 158, 11, 0.08)", // Amber
    accentColor: "#f59e0b",
  },
];

const AUTO_PLAY_TIME = 6000;

export default function WidescreenHeroSlider() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0); // -1 for prev, 1 for next
  const [isPlaying, setIsPlaying] = useState(true);

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

  // Autoplay
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      handleNext();
    }, AUTO_PLAY_TIME);

    return () => clearInterval(timer);
  }, [isPlaying, handleNext]);

  const activeSlide = slides[currentIndex];

  // Motion variants for slide cross-fade/slide horizontal animation
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
    <div className="w-full max-w-7xl mx-auto px-4 py-6 z-10 relative">
      <Card
        size="default"
        className="relative w-full aspect-[4/3] sm:aspect-[16/10] md:aspect-video overflow-hidden border border-border bg-card rounded-2xl shadow-xs"
        onMouseEnter={() => setIsPlaying(false)}
        onMouseLeave={() => setIsPlaying(true)}
      >
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className={`absolute inset-0 w-full h-full bg-gradient-to-br ${activeSlide.gradient} flex items-center`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 w-full h-full items-center p-6 sm:p-12 lg:p-16 gap-6 md:gap-8">
              
              {/* Left Column: Text Content */}
              <div className="w-full flex flex-col justify-center items-center md:items-start text-center md:text-left order-2 md:order-1 max-w-lg mx-auto md:mx-0 z-10">
                
                {/* Monospace Badge tag */}
                <div className="mb-3">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-white/50 border border-white/10 px-2 py-0.5 rounded uppercase">
                    {activeSlide.badge}
                  </span>
                </div>

                {/* Main Headline */}
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.1] mb-3 uppercase">
                  {activeSlide.title}
                </h1>

                {/* Subtitle description */}
                <p className="text-white/60 text-xs sm:text-sm md:text-base leading-relaxed mb-6 max-w-md">
                  {activeSlide.description}
                </p>

                {/* Pricing & CTA */}
                <div className="flex items-center gap-5 sm:gap-6">
                  <div className="text-left">
                    <span className="text-[9px] text-white/40 block uppercase tracking-widest leading-none">Starting at</span>
                    <span className="text-xl sm:text-2xl font-extrabold text-white leading-none">{activeSlide.price}</span>
                  </div>
                  <Link
                    href={activeSlide.link}
                    className="group inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm px-5 h-10 transition-all shadow-sm hover:shadow-md cursor-pointer gap-2 active:translate-y-px"
                  >
                    Shop Now
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </div>

              </div>

              {/* Right Column: Floating Product Image */}
              <div className="w-full flex items-center justify-center order-1 md:order-2 relative h-[160px] sm:h-[220px] md:h-full">
                
                {/* Colored Ambient Radial Glow */}
                <div
                  className="absolute w-[150px] h-[150px] sm:w-[240px] sm:h-[240px] md:w-[350px] md:h-[350px] rounded-full blur-[50px] sm:blur-[70px] md:blur-[100px] pointer-events-none opacity-80 z-0"
                  style={{ backgroundColor: activeSlide.glowColor }}
                />

                {/* Floating Image Wrapper */}
                <motion.div
                  className="relative w-[140px] h-[140px] sm:w-[200px] sm:h-[200px] md:w-[300px] md:h-[300px] lg:w-[380px] lg:h-[380px] z-10 flex items-center justify-center"
                  animate={{
                    y: [0, -8, 0],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <Image
                    src={activeSlide.image}
                    alt={activeSlide.title}
                    fill
                    priority
                    sizes="(max-width: 640px) 140px, (max-width: 1024px) 200px, 380px"
                    className="object-contain filter drop-shadow-[0_20px_40px_rgba(0,0,0,0.15)] pointer-events-none select-none"
                  />
                </motion.div>
              </div>

            </div>
          </motion.div>
        </AnimatePresence>

        {/* Lower-Center Dot Pagination Indicators */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-30">
          {slides.map((slide, index) => {
            const isActive = index === currentIndex;
            return (
              <button
                key={slide.id}
                onClick={() => handleDotClick(index)}
                className={`h-1.5 rounded-full transition-all duration-300 focus:outline-none cursor-pointer ${
                  isActive ? "bg-white w-5" : "bg-white/20 w-1.5 hover:bg-white/40"
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            );
          })}
        </div>

      </Card>
    </div>
  );
}
