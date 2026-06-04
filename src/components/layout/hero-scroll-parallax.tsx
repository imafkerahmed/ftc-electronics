"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MousePointerClick } from "lucide-react";
import { motion, useScroll, useTransform, useMotionValueEvent } from "motion/react";
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
  accentColor: string;
  glowColor: string;
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
    image: "/assets/hero-laptop.png",
    accentColor: "#3b82f6",
    glowColor: "rgba(59, 130, 246, 0.15)",
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
    image: "/assets/hero-headphones.png",
    accentColor: "#8b5cf6",
    glowColor: "rgba(139, 92, 246, 0.15)",
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
    image: "/assets/hero-phone.png",
    accentColor: "#f43f5e",
    glowColor: "rgba(244, 63, 94, 0.15)",
  },
];

export default function HeroScrollParallax() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Monitor page scroll progress relative to the container
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Dynamically update active index for indicators
  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    if (latest < 0.33) {
      setActiveIndex(0);
    } else if (latest < 0.66) {
      setActiveIndex(1);
    } else {
      setActiveIndex(2);
    }
  });

  // Calculate slide scroll values using transforms
  // Slide 1 (Laptop)
  const slide1Opacity = useTransform(scrollYProgress, [0, 0.22, 0.30, 0.33], [1, 1, 0, 0]);
  const slide1Y = useTransform(scrollYProgress, [0, 0.22, 0.30, 0.33], [0, 0, -40, -60]);
  const slide1Scale = useTransform(scrollYProgress, [0, 0.22, 0.30, 0.33], [1, 1.05, 0.95, 0.9]);
  
  // Slide 2 (Headphones)
  const slide2Opacity = useTransform(scrollYProgress, [0.28, 0.33, 0.43, 0.55, 0.63, 0.66], [0, 0, 1, 1, 0, 0]);
  const slide2Y = useTransform(scrollYProgress, [0.28, 0.33, 0.43, 0.55, 0.63, 0.66], [40, 30, 0, 0, -30, -40]);
  const slide2Scale = useTransform(scrollYProgress, [0.28, 0.33, 0.43, 0.55, 0.63, 0.66], [0.9, 0.92, 1, 1, 0.95, 0.9]);

  // Slide 3 (Phone)
  const slide3Opacity = useTransform(scrollYProgress, [0.61, 0.66, 0.76, 1.0], [0, 0, 1, 1]);
  const slide3Y = useTransform(scrollYProgress, [0.61, 0.66, 0.76, 1.0], [40, 30, 0, 0]);
  const slide3Scale = useTransform(scrollYProgress, [0.61, 0.66, 0.76, 1.0], [0.9, 0.92, 1, 1.05]);

  // Floating Indicator "Scroll to explore" Opacity (fades out near the end)
  const scrollPromptOpacity = useTransform(scrollYProgress, [0, 0.85, 0.95], [1, 1, 0]);

  // Scroll to slide zone on dot click
  const handleDotClick = (index: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    // Divide container scroll heights equally (3 stages)
    const targetScroll = scrollTop + rect.top + (index * rect.height) / 3;
    window.scrollTo({
      top: targetScroll,
      behavior: "smooth",
    });
  };

  return (
    <div ref={containerRef} className="relative w-full h-[300vh] bg-background">
      
      {/* Sticky viewport frame */}
      <div className="sticky top-16 w-full h-[calc(100vh-4rem)] min-h-[600px] overflow-hidden flex items-center border-b border-border">
        
        {/* Background grid lines */}
        <div className="absolute inset-0 grid grid-cols-4 pointer-events-none opacity-20 z-0">
          <div className="border-r border-border h-full" />
          <div className="border-r border-border h-full hidden sm:block" />
          <div className="border-r border-border h-full hidden lg:block" />
          <div className="h-full" />
        </div>

        {/* Dynamic large number background */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[14rem] sm:text-[18rem] lg:text-[22rem] font-bold text-neutral-100 dark:text-neutral-900/10 pointer-events-none select-none z-0">
          0{activeIndex + 1}
        </div>

        {/* ---------------- SLIDE 1 (Laptop) ---------------- */}
        <motion.div
          style={{ opacity: slide1Opacity, y: slide1Y }}
          className={`absolute inset-0 w-full h-full flex flex-col lg:flex-row items-center justify-between px-6 sm:px-12 lg:px-24 py-12 lg:py-0 ${
            activeIndex === 0 ? "pointer-events-auto z-20" : "pointer-events-none z-10"
          }`}
        >
          {/* Left: Content */}
          <div className="w-full lg:w-1/2 flex flex-col justify-center items-center lg:items-start text-center lg:text-left order-2 lg:order-1 max-w-xl mx-auto lg:mx-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider text-white bg-blue-600">
                {slides[0].category}
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                {slides[0].subtitle}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15] mb-4">
              {slides[0].title}
            </h1>
            <div className="flex flex-wrap justify-center lg:justify-start gap-1.5 mb-5">
              {slides[0].specs.map((spec, i) => (
                <span key={i} className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted border border-border text-foreground/80">
                  {spec}
                </span>
              ))}
            </div>
            <p className="text-muted-foreground text-xs sm:text-sm md:text-base leading-relaxed mb-6 max-w-lg">
              {slides[0].description}
            </p>
            <div className="flex items-center gap-6">
              <div className="text-left">
                <span className="text-[10px] text-muted-foreground block uppercase tracking-widest">Price starting at</span>
                <span className="text-2xl sm:text-3xl font-extrabold text-foreground leading-none">{slides[0].price}</span>
              </div>
              <Link
                href={slides[0].link}
                className="group inline-flex items-center justify-center rounded-lg text-white transition-all duration-300 h-10 px-5 sm:px-6 cursor-pointer gap-2 text-xs sm:text-sm font-bold shadow-sm hover:shadow-md hover:brightness-105 active:translate-y-px"
                style={{ backgroundColor: slides[0].accentColor }}
              >
                Shop Now
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
          {/* Right: Floating Product Image */}
          <div className="w-full lg:w-1/2 flex items-center justify-center order-1 lg:order-2 relative h-[220px] sm:h-[300px] lg:h-full">
            <div className="absolute w-[200px] h-[200px] sm:w-[300px] sm:h-[300px] lg:w-[450px] lg:h-[450px] rounded-full blur-[60px] sm:blur-[90px] lg:blur-[120px] pointer-events-none opacity-80 z-0 bg-blue-500/10" />
            <motion.div style={{ scale: slide1Scale }} className="relative w-[180px] h-[180px] sm:w-[260px] sm:h-[260px] lg:w-[420px] lg:h-[420px] z-10 flex items-center justify-center">
              <Image src={slides[0].image} alt={slides[0].title} fill priority sizes="(max-width: 640px) 180px, (max-width: 1024px) 260px, 420px" className="object-contain filter drop-shadow-[0_20px_40px_rgba(0,0,0,0.06)] pointer-events-none select-none" />
            </motion.div>
          </div>
        </motion.div>

        {/* ---------------- SLIDE 2 (Headphones) ---------------- */}
        <motion.div
          style={{ opacity: slide2Opacity, y: slide2Y }}
          className={`absolute inset-0 w-full h-full flex flex-col lg:flex-row items-center justify-between px-6 sm:px-12 lg:px-24 py-12 lg:py-0 ${
            activeIndex === 1 ? "pointer-events-auto z-20" : "pointer-events-none z-10"
          }`}
        >
          {/* Left: Content */}
          <div className="w-full lg:w-1/2 flex flex-col justify-center items-center lg:items-start text-center lg:text-left order-2 lg:order-1 max-w-xl mx-auto lg:mx-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider text-white bg-violet-600">
                {slides[1].category}
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                {slides[1].subtitle}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15] mb-4">
              {slides[1].title}
            </h1>
            <div className="flex flex-wrap justify-center lg:justify-start gap-1.5 mb-5">
              {slides[1].specs.map((spec, i) => (
                <span key={i} className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted border border-border text-foreground/80">
                  {spec}
                </span>
              ))}
            </div>
            <p className="text-muted-foreground text-xs sm:text-sm md:text-base leading-relaxed mb-6 max-w-lg">
              {slides[1].description}
            </p>
            <div className="flex items-center gap-6">
              <div className="text-left">
                <span className="text-[10px] text-muted-foreground block uppercase tracking-widest">Price starting at</span>
                <span className="text-2xl sm:text-3xl font-extrabold text-foreground leading-none">{slides[1].price}</span>
              </div>
              <Link
                href={slides[1].link}
                className="group inline-flex items-center justify-center rounded-lg text-white transition-all duration-300 h-10 px-5 sm:px-6 cursor-pointer gap-2 text-xs sm:text-sm font-bold shadow-sm hover:shadow-md hover:brightness-105 active:translate-y-px"
                style={{ backgroundColor: slides[1].accentColor }}
              >
                Shop Now
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
          {/* Right: Floating Product Image */}
          <div className="w-full lg:w-1/2 flex items-center justify-center order-1 lg:order-2 relative h-[220px] sm:h-[300px] lg:h-full">
            <div className="absolute w-[200px] h-[200px] sm:w-[300px] sm:h-[300px] lg:w-[450px] lg:h-[450px] rounded-full blur-[60px] sm:blur-[90px] lg:blur-[120px] pointer-events-none opacity-80 z-0 bg-violet-500/10" />
            <motion.div style={{ scale: slide2Scale }} className="relative w-[180px] h-[180px] sm:w-[260px] sm:h-[260px] lg:w-[420px] lg:h-[420px] z-10 flex items-center justify-center">
              <Image src={slides[1].image} alt={slides[1].title} fill priority sizes="(max-width: 640px) 180px, (max-width: 1024px) 260px, 420px" className="object-contain filter drop-shadow-[0_20px_40px_rgba(0,0,0,0.06)] pointer-events-none select-none" />
            </motion.div>
          </div>
        </motion.div>

        {/* ---------------- SLIDE 3 (Phone) ---------------- */}
        <motion.div
          style={{ opacity: slide3Opacity, y: slide3Y }}
          className={`absolute inset-0 w-full h-full flex flex-col lg:flex-row items-center justify-between px-6 sm:px-12 lg:px-24 py-12 lg:py-0 ${
            activeIndex === 2 ? "pointer-events-auto z-20" : "pointer-events-none z-10"
          }`}
        >
          {/* Left: Content */}
          <div className="w-full lg:w-1/2 flex flex-col justify-center items-center lg:items-start text-center lg:text-left order-2 lg:order-1 max-w-xl mx-auto lg:mx-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider text-white bg-rose-600">
                {slides[2].category}
              </span>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                {slides[2].subtitle}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.15] mb-4">
              {slides[2].title}
            </h1>
            <div className="flex flex-wrap justify-center lg:justify-start gap-1.5 mb-5">
              {slides[2].specs.map((spec, i) => (
                <span key={i} className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted border border-border text-foreground/80">
                  {spec}
                </span>
              ))}
            </div>
            <p className="text-muted-foreground text-xs sm:text-sm md:text-base leading-relaxed mb-6 max-w-lg">
              {slides[2].description}
            </p>
            <div className="flex items-center gap-6">
              <div className="text-left">
                <span className="text-[10px] text-muted-foreground block uppercase tracking-widest">Price starting at</span>
                <span className="text-2xl sm:text-3xl font-extrabold text-foreground leading-none">{slides[2].price}</span>
              </div>
              <Link
                href={slides[2].link}
                className="group inline-flex items-center justify-center rounded-lg text-white transition-all duration-300 h-10 px-5 sm:px-6 cursor-pointer gap-2 text-xs sm:text-sm font-bold shadow-sm hover:shadow-md hover:brightness-105 active:translate-y-px"
                style={{ backgroundColor: slides[2].accentColor }}
              >
                Shop Now
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
          {/* Right: Floating Product Image */}
          <div className="w-full lg:w-1/2 flex items-center justify-center order-1 lg:order-2 relative h-[220px] sm:h-[300px] lg:h-full">
            <div className="absolute w-[200px] h-[200px] sm:w-[300px] sm:h-[300px] lg:w-[450px] lg:h-[450px] rounded-full blur-[60px] sm:blur-[90px] lg:blur-[120px] pointer-events-none opacity-80 z-0 bg-rose-500/10" />
            <motion.div style={{ scale: slide3Scale }} className="relative w-[180px] h-[180px] sm:w-[260px] sm:h-[260px] lg:w-[420px] lg:h-[420px] z-10 flex items-center justify-center">
              <Image src={slides[2].image} alt={slides[2].title} fill priority sizes="(max-width: 640px) 180px, (max-width: 1024px) 260px, 420px" className="object-contain filter drop-shadow-[0_20px_40px_rgba(0,0,0,0.06)] pointer-events-none select-none" />
            </motion.div>
          </div>
        </motion.div>

        {/* Floating Side Dot Navigation Indicators (Right aligned) */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-5 z-40">
          {slides.map((slide, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={slide.id}
                onClick={() => handleDotClick(index)}
                className="group relative flex items-center justify-end py-1.5 focus:outline-none cursor-pointer"
                aria-label={`Scroll to product ${slide.title}`}
              >
                {/* Text Label on hover */}
                <span className={`text-[10px] font-bold uppercase tracking-widest mr-3 transition-all duration-300 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}>
                  {slide.title}
                </span>
                {/* Dot */}
                <div
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    isActive ? "w-6" : "w-2.5 bg-muted-foreground/30 group-hover:bg-muted-foreground/60"
                  }`}
                  style={{
                    backgroundColor: isActive ? slide.accentColor : undefined,
                  }}
                />
              </button>
            );
          })}
        </div>

        {/* Floating bottom indicator "Scroll to explore" */}
        <motion.div
          style={{ opacity: scrollPromptOpacity }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none z-30"
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/75">
            Scroll to explore
          </span>
          <motion.div
            animate={{
              y: [0, 6, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="w-5 h-8 border-2 border-muted-foreground/30 rounded-full flex justify-center p-1"
          >
            <div className="w-1 h-2 bg-muted-foreground/60 rounded-full" />
          </motion.div>
        </motion.div>

      </div>
    </div>
  );
}
