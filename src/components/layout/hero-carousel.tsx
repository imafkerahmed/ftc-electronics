"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";

interface Slide {
  id: number;
  category: string;
  title: string;
  subtitle: string;
  price: string;
  specs: string[];
  description: string;
  link: string;
  image: string;
  accentColor: string; // Tailwind tint or theme hex color
  glowColor: string;   // Soft RGBA background glow
}

const slides: Slide[] = [
  {
    id: 1,
    category: "Laptops",
    title: "Zenith Pro 16",
    subtitle: "Ultimate Creator Workstation",
    price: "$1,899",
    specs: ["RTX 4080", "Intel i9 14th Gen", "240Hz OLED"],
    description: "Designed for demanding workloads and elite gaming. The Zenith Pro 16 features a color-accurate 16-inch OLED panel combined with a dual-fan vapor chamber cooling design.",
    link: "/products?category=laptops",
    image: "/assets/hero-laptop.webp",
    accentColor: "#3b82f6", // Blue
    glowColor: "rgba(59, 130, 246, 0.12)",
  },
  {
    id: 2,
    category: "Audio",
    title: "Auralux ANC",
    subtitle: "Immersive Soundscape",
    price: "$349",
    specs: ["Hybrid ANC", "40h Battery", "Hi-Res Wireless"],
    description: "Escape the noise. The Auralux ANC headphones deliver studio-grade acoustics, bespoke noise isolation, and a sculpted aluminum chassis for all-day listening comfort.",
    link: "/products?category=audio",
    image: "/assets/hero-headphones.webp",
    accentColor: "#8b5cf6", // Violet
    glowColor: "rgba(139, 92, 246, 0.12)",
  },
  {
    id: 3,
    category: "Phones",
    title: "Nexus 15 Ultra",
    subtitle: "Next-Gen Mobile Innovation",
    price: "$999",
    specs: ["Titanium Chassis", "200MP Camera", "5G Advanced"],
    description: "A perfect blend of durability and elegance. Featuring a aerospace-grade titanium body and our most advanced camera array, the Nexus 15 Ultra redefines what is possible.",
    link: "/products?category=phones",
    image: "/assets/hero-phone.webp",
    accentColor: "#f43f5e", // Rose
    glowColor: "rgba(244, 63, 94, 0.12)",
  },
];

const AUTO_PLAY_TIME = 7000;

export default function HeroCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleNext = useCallback(() => {
    setDirection(1);
    setCurrentIndex((prevIndex) => (prevIndex + 1) % slides.length);
  }, []);

  const handlePrev = useCallback(() => {
    setDirection(-1);
    setCurrentIndex((prevIndex) => (prevIndex - 1 + slides.length) % slides.length);
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

  // Handle Drag/Swipe Navigation
  const dragThreshold = 50;
  const handleDragEnd = (_event: unknown, info: { offset: { x: number } }) => {
    const swipe = info.offset.x;
    if (swipe < -dragThreshold) {
      handleNext();
    } else if (swipe > dragThreshold) {
      handlePrev();
    }
  };

  const activeSlide = slides[currentIndex];

  // Animation variants for unified slide transition
  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? "100%" : "-100%",
      opacity: 0,
    }),
    center: {
      x: "0%",
      opacity: 1,
      transition: {
        x: { type: "spring" as const, stiffness: 100, damping: 18 },
        opacity: { duration: 0.35 },
      },
    },
    exit: (dir: number) => ({
      x: dir > 0 ? "-100%" : "100%",
      opacity: 0,
      transition: {
        x: { type: "spring" as const, stiffness: 100, damping: 18 },
        opacity: { duration: 0.35 },
      },
    }),
  };

  return (
    <section
      ref={containerRef}
      className="relative w-full min-h-[620px] sm:min-h-[700px] lg:h-[calc(100vh-4rem)] lg:min-h-[650px] lg:max-h-[850px] bg-background border-b border-border overflow-hidden select-none pt-16 sm:pt-20 lg:pt-24"
      onMouseEnter={() => setIsPlaying(false)}
      onMouseLeave={() => setIsPlaying(true)}
      aria-label="New Arrivals Products Carousel"
    >
      {/* Subtle Background Page Aesthetics Grid lines */}
      <div className="absolute inset-0 grid grid-cols-4 pointer-events-none opacity-20 z-0">
        <div className="border-r border-border h-full" />
        <div className="border-r border-border h-full hidden sm:block" />
        <div className="border-r border-border h-full hidden lg:block" />
        <div className="h-full" />
      </div>

      {/* Slide Container with AnimatePresence */}
      <div className="relative w-full h-full">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            className="absolute inset-0 w-full h-full flex flex-col lg:flex-row items-center justify-between px-4 sm:px-12 lg:px-24 py-12 lg:py-0 z-10 cursor-grab active:cursor-grabbing"
          >
            {/* 1. Mobile/Tablet: Image sits on top. Desktop: Image sits on right. */}
            <div className="w-full lg:w-1/2 flex items-center justify-center order-1 lg:order-2 relative h-[250px] sm:h-[350px] lg:h-full">
              
              {/* Soft Pulsing Ambient Glow */}
              <motion.div
                className="absolute w-[200px] h-[200px] sm:w-[320px] sm:h-[320px] lg:w-[450px] lg:h-[450px] rounded-full blur-[60px] sm:blur-[90px] lg:blur-[120px] pointer-events-none opacity-80 z-0"
                style={{ backgroundColor: activeSlide.glowColor }}
                animate={{
                  scale: [1, 1.1, 1],
                  opacity: [0.7, 0.9, 0.7],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />

              {/* Floating Product Image */}
              <motion.div
                className="relative w-[200px] h-[200px] sm:w-[300px] sm:h-[300px] lg:w-[450px] lg:h-[450px] z-10 flex items-center justify-center"
                animate={{
                  y: [0, -10, 0],
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
                  sizes="(max-width: 640px) 200px, (max-width: 1024px) 300px, 450px"
                  className="object-contain filter drop-shadow-[0_20px_40px_rgba(0,0,0,0.06)] pointer-events-none select-none"
                />
              </motion.div>
            </div>

            {/* 2. Text Details: Mobile/Tablet centered at bottom. Desktop left-aligned. */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center items-center lg:items-start text-center lg:text-left order-2 lg:order-1 mt-6 lg:mt-0 z-20 max-w-xl mx-auto lg:mx-0">
              
              {/* Subtitle / Category Label */}
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider text-white transition-colors duration-300"
                  style={{ backgroundColor: activeSlide.accentColor }}
                >
                  {activeSlide.category}
                </span>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  {activeSlide.subtitle}
                </span>
              </div>

              {/* Main Title */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15] mb-4">
                {activeSlide.title}
              </h1>

              {/* Specs Badge Pills */}
              <div className="flex flex-wrap justify-center lg:justify-start gap-1.5 mb-5">
                {activeSlide.specs.map((spec, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted border border-border text-foreground/80"
                  >
                    {spec}
                  </span>
                ))}
              </div>

              {/* Description */}
              <p className="text-muted-foreground text-xs sm:text-sm md:text-base leading-relaxed mb-6 max-w-lg">
                {activeSlide.description}
              </p>

              {/* Price & CTA Button */}
              <div className="flex items-center gap-5 sm:gap-6">
                <div className="text-left">
                  <span className="text-[10px] text-muted-foreground block uppercase tracking-widest">Price starting at</span>
                  <span className="text-2xl sm:text-3xl font-extrabold text-foreground leading-none">{activeSlide.price}</span>
                </div>
                <Link
                  href={activeSlide.link}
                  className="group inline-flex items-center justify-center rounded-lg text-white transition-all duration-300 h-10 px-5 sm:px-6 cursor-pointer gap-2 text-xs sm:text-sm font-bold shadow-sm hover:shadow-md hover:brightness-105 active:translate-y-px"
                  style={{
                    backgroundColor: activeSlide.accentColor,
                  }}
                >
                  Shop Now
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </div>

            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Manual Desktop Left & Right Arrow Buttons - Hidden on Touch Screens/Mobile */}
      <div className="hidden lg:flex absolute top-1/2 -translate-y-1/2 left-6 right-6 justify-between pointer-events-none z-30">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePrev}
          className="h-10 w-10 rounded-full border-border bg-background/60 backdrop-blur-sm text-muted-foreground hover:text-foreground cursor-pointer pointer-events-auto transition-transform hover:scale-105"
          aria-label="Previous Slide"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleNext}
          className="h-10 w-10 rounded-full border-border bg-background/60 backdrop-blur-sm text-muted-foreground hover:text-foreground cursor-pointer pointer-events-auto transition-transform hover:scale-105"
          aria-label="Next Slide"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Bottom Centered Progress Indicators (Extremely mobile-friendly) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 sm:gap-3 z-30">
        {slides.map((slide, index) => {
          const isActive = index === currentIndex;
          return (
            <button
              key={slide.id}
              onClick={() => handleDotClick(index)}
              className="group relative flex flex-col items-center gap-1 py-1 cursor-pointer focus:outline-none"
              aria-label={`Go to slide ${index + 1}`}
            >
              {/* Responsive Bar line */}
              <div className="w-8 sm:w-12 h-1 rounded-full bg-muted overflow-hidden transition-all duration-300">
                {isActive && isPlaying && (
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{
                      duration: AUTO_PLAY_TIME / 1000,
                      ease: "linear",
                    }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: activeSlide.accentColor }}
                  />
                )}
                {isActive && !isPlaying && (
                  <div
                    className="h-full rounded-full w-full"
                    style={{ backgroundColor: activeSlide.accentColor }}
                  />
                )}
              </div>
              <span
                className={`text-[9px] font-bold tracking-wider transition-opacity duration-300 ${
                  isActive ? "text-foreground opacity-100" : "text-muted-foreground opacity-40 group-hover:opacity-75"
                }`}
              >
                0{slide.id}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
