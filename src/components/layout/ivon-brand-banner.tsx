"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Zap, ShieldCheck, Headphones, Sparkles } from "lucide-react";
import { motion } from "motion/react";

export default function IvonBrandBanner() {
  // Particles state to prevent server-side hydration mismatch
  const [particles, setParticles] = useState<Array<{
    id: number;
    left: string;
    top: string;
    size: number;
    delay: number;
    duration: number;
    color: string;
  }>>([]);

  useEffect(() => {
    // Generate fine glowing ambient particles
    const generated = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: Math.random() * 3 + 1, // 1px to 4px
      delay: Math.random() * 4,
      duration: Math.random() * 6 + 6, // 6s to 12s
      color: Math.random() > 0.5 ? "rgba(6, 182, 212, 0.4)" : "rgba(234, 179, 8, 0.3)", // Cyan or Yellow
    }));
    const frame = requestAnimationFrame(() => {
      setParticles(generated);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <section
      className="w-full py-16 sm:py-24 relative overflow-hidden bg-gradient-to-b from-background via-muted/20 to-background border-y border-border"
    >
      {/* Background ambient glowing orbs */}
      <div className="absolute w-[400px] h-[400px] rounded-full blur-[100px] pointer-events-none opacity-40 dark:opacity-20 bg-cyan-500 -left-20 top-1/4 -z-10 animate-pulse duration-[8000ms]" />
      <div className="absolute w-[350px] h-[350px] rounded-full blur-[120px] pointer-events-none opacity-30 dark:opacity-15 bg-yellow-500 -right-20 bottom-1/4 -z-10 animate-pulse duration-[10000ms]" />

      {/* Floating Particles Overlay */}
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full pointer-events-none -z-10"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 8px ${p.color}`,
          }}
          animate={{
            y: [-10, -70, -10],
            opacity: [0, 0.5, 0],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: "easeInOut",
          }}
        />
      ))}

      <div className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left Column: Product Information and Tech Details */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            
            {/* Animated Brand Badge */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 dark:border-cyan-500/25 bg-cyan-500/5 text-cyan-600 dark:text-cyan-400 text-xs font-semibold tracking-wide mb-5"
            >
              <Sparkles className="h-3.5 w-3.5 animate-spin duration-3000" />
              <span>NEW COLLECTION</span>
            </motion.div>

            {/* Subtitle */}
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
              Smart Accessories Partner
            </span>

            {/* Stunning Main Title with Color Gradient */}
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tight leading-[1.1] mb-6">
              Unleash the Power of{" "}
              <span className="bg-gradient-to-r from-cyan-600 via-cyan-400 to-amber-500 bg-clip-text text-transparent dark:from-cyan-400 dark:via-cyan-300 dark:to-yellow-400">
                IVON
              </span>
            </h2>

            {/* Description Paragraph */}
            <p className="text-sm sm:text-base leading-relaxed text-muted-foreground mb-8 max-w-xl">
              Elevate your daily connectivity with {"IVON's"} high-performance ecosystem. 
              From intelligent auto-sensing fast chargers to military-grade armored cables 
              and crystal-clear wireless audio, discover engineering-focused design that 
              charges fast and plays clean.
            </p>

            {/* Interactive Product Category Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mb-8">
              
              {/* Highlight 1: Volt Charging */}
              <div className="group/card flex flex-col p-4 rounded-xl border border-border bg-card hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5 transition-all duration-300">
                <div className="h-9 w-9 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-3 group-hover/card:scale-110 transition-transform duration-300">
                  <Zap className="h-5 w-5" />
                </div>
                <h4 className="font-bold text-sm text-card-foreground mb-1 group-hover/card:text-cyan-600 dark:group-hover/card:text-cyan-400 transition-colors">
                  Volt Charging
                </h4>
                <p className="text-xs text-muted-foreground leading-snug">
                  Smart auto-sensing dual USB quick-charging blocks.
                </p>
              </div>

              {/* Highlight 2: Armored Cables */}
              <div className="group/card flex flex-col p-4 rounded-xl border border-border bg-card hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/5 transition-all duration-300">
                <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-500 flex items-center justify-center mb-3 group-hover/card:scale-110 transition-transform duration-300">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <h4 className="font-bold text-sm text-card-foreground mb-1 group-hover/card:text-amber-600 dark:group-hover/card:text-amber-400 transition-colors">
                  Armored Cables
                </h4>
                <p className="text-xs text-muted-foreground leading-snug">
                  Braided heavy-duty cords tested to 10k+ bends.
                </p>
              </div>

              {/* Highlight 3: Wave Audio */}
              <div className="group/card flex flex-col p-4 rounded-xl border border-border bg-card hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/5 transition-all duration-300">
                <div className="h-9 w-9 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-3 group-hover/card:scale-110 transition-transform duration-300">
                  <Headphones className="h-5 w-5" />
                </div>
                <h4 className="font-bold text-sm text-card-foreground mb-1 group-hover/card:text-cyan-600 dark:group-hover/card:text-cyan-400 transition-colors">
                  Wave Audio
                </h4>
                <p className="text-xs text-muted-foreground leading-snug">
                  TWS noise canceling earbuds with high-fidelity bass.
                </p>
              </div>
            </div>

            {/* Call To Action Button */}
            <Link href="/products?search=IVON">
              <button className="group flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider text-white bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 shadow-md shadow-cyan-600/25 transition-all duration-300 hover:translate-x-0.5 hover:shadow-lg hover:shadow-cyan-600/35 cursor-pointer">
                <span>Shop IVON Collection</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </Link>
          </div>

          {/* Right Column: Floating IVON Logo Presentation */}
          <div className="lg:col-span-5 flex items-center justify-center relative min-h-[300px]">
            
            {/* Tech concentric grid circles behind the card */}
            <div className="absolute w-[120%] h-[120%] flex items-center justify-center pointer-events-none -z-10 opacity-70">
              <svg className="w-full h-full text-cyan-500/10 dark:text-cyan-400/5" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="200" cy="200" r="140" stroke="currentColor" strokeWidth="1" strokeDasharray="4 8" />
                <circle cx="200" cy="200" r="100" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="200" cy="200" r="60" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 3" />
                <line x1="200" y1="20" x2="200" y2="380" stroke="currentColor" strokeWidth="0.5" strokeDasharray="6 6" />
                <line x1="20" y1="200" x2="380" y2="200" stroke="currentColor" strokeWidth="0.5" strokeDasharray="6 6" />
                <polygon points="200,40 338,120 338,280 200,360 62,280 62,120" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 4" />
              </svg>
            </div>

            {/* Glowing highlight base behind the card */}
            <div className="absolute w-[200px] h-[200px] rounded-full blur-[60px] opacity-25 dark:opacity-20 bg-cyan-400 pointer-events-none -z-10" />

            {/* Floating Gloss-White Logo Card Container */}
            <motion.div
              className="w-[280px] sm:w-[320px] aspect-square relative rounded-2xl p-6 bg-white shadow-[0_20px_50px_rgba(0,188,212,0.15)] border border-neutral-100 hover:shadow-[0_25px_60px_rgba(0,188,212,0.25)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] dark:border-neutral-800 transition-all duration-500 hover:scale-[1.03] group overflow-hidden"
              animate={{
                y: [0, -10, 0],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              {/* Subtle tech border gloss inside the card */}
              <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/0 via-cyan-500/0 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
              
              <div className="w-full h-full relative flex items-center justify-center bg-white rounded-xl p-4 overflow-hidden">
                <Image
                  src="/assets/banners/IVON.jpeg"
                  alt="IVON Brand Logo"
                  fill
                  className="object-contain p-2 transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 320px"
                  priority
                />
              </div>

              {/* Decorative Corner Tech Details */}
              <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-cyan-500/35 rounded-tl" />
              <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-cyan-500/35 rounded-tr" />
              <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-cyan-500/35 rounded-bl" />
              <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-cyan-500/35 rounded-br" />
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}
