"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";

interface PromoBannerProps {
  title: string;
  subtitle: string;
  description: string;
  badge?: string;
  imageSrc: string;
  imageAlt?: string;
  ctaText?: string;
  ctaLink?: string;
  themeColor?: "blue" | "red" | "purple" | "teal";
  imagePosition?: "left" | "right";
  bgImageSrc?: string;
  bgImageOpacity?: number;
  className?: string;
  isCinematic?: boolean;
}

export default function PromoBanner({
  title,
  subtitle,
  description,
  badge,
  imageSrc,
  imageAlt = "Promotional banner image",
  ctaText = "Shop Now",
  ctaLink = "/products",
  themeColor = "blue",
  imagePosition = "right",
  bgImageSrc,
  bgImageOpacity,
  className = "",
  isCinematic = false,
}: PromoBannerProps) {
  // Particles state to prevent hydration mismatches
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
    let frameId: number;
    if (isCinematic) {
      const generated = Array.from({ length: 25 }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        size: Math.random() * 2.2 + 0.8, // 0.8px to 3px
        delay: Math.random() * 5,
        duration: Math.random() * 8 + 6, // 6s to 14s
        color: Math.random() > 0.4 ? "rgba(255, 255, 255, 0.45)" : "rgba(129, 140, 248, 0.55)",
      }));
      frameId = requestAnimationFrame(() => {
        setParticles(generated);
      });
    }
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [isCinematic]);

  // Theme definitions for backgrounds, glows, and button states
  const getThemeClasses = () => {
    if (isCinematic) {
      return {
        glow: "bg-indigo-500/10",
        btnBg: "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/35 border border-indigo-500/30",
        badgeBorder: "border-neutral-800 bg-neutral-900/50 text-indigo-400",
      };
    }
    switch (themeColor) {
      case "red":
        return {
          glow: "bg-red-500/10 dark:bg-red-500/15",
          btnBg: "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20",
          badgeBorder: "border-red-500/30 text-red-600 dark:text-red-400 bg-red-500/5",
        };
      case "purple":
        return {
          glow: "bg-purple-500/10 dark:bg-purple-500/15",
          btnBg: "bg-violet-600 hover:bg-violet-700 text-white shadow-violet-600/20",
          badgeBorder: "border-violet-500/30 text-violet-600 dark:text-violet-400 bg-violet-500/5",
        };
      case "teal":
        return {
          glow: "bg-teal-500/10 dark:bg-teal-500/15",
          btnBg: "bg-teal-600 hover:bg-teal-750 text-white shadow-teal-500/20",
          badgeBorder: "border-teal-500/30 text-teal-600 dark:text-teal-400 bg-teal-500/5",
        };
      case "blue":
      default:
        return {
          glow: "bg-blue-500/10 dark:bg-blue-500/15",
          btnBg: "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20",
          badgeBorder: "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5",
        };
    }
  };

  const theme = getThemeClasses();
  const sectionRef = useRef<HTMLElement>(null);
  
  // Track scroll position relative to the section viewport
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  // Map scroll progress to a slow vertical translate y offset
  const bgY = useTransform(scrollYProgress, [0, 1], ["-10%", "10%"]);

  const finalOpacity = bgImageOpacity !== undefined ? bgImageOpacity : 0.25;

  return (
    <section 
      ref={sectionRef} 
      className={
        isCinematic 
          ? `w-full bg-[#050508] text-white py-16 sm:py-24 overflow-hidden relative ${className}`
          : `w-full py-8 sm:py-12 relative overflow-hidden bg-background ${className}`
      }
    >
      {/* Background ambient glow layer directly behind floating keyboard asset */}
      {isCinematic && (
        <div className="bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.12)_0%,transparent_65%)] blur-2xl absolute inset-0 pointer-events-none -z-10" />
      )}

      {/* Particle field overlay */}
      {isCinematic && particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 4px ${p.color}`,
          }}
          animate={{
            y: [-20, -120],
            opacity: [0, 0.4, 0],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Parallax Background Image */}
      {bgImageSrc && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-20">
          <motion.div
            style={{ y: bgY }}
            className="absolute -inset-y-16 inset-x-0 w-full h-[calc(100%+128px)]"
          >
            <Image
              src={bgImageSrc}
              alt="Section background texture"
              fill
              className={`object-cover ${isCinematic ? "mix-blend-screen" : "mix-blend-multiply dark:mix-blend-screen dark:invert"}`}
              style={{ opacity: isCinematic ? 0.08 : finalOpacity }}
              sizes="100vw"
              priority={false}
            />
            {/* Fade overlays on edges to blend seamlessly with surrounding page color */}
            <div className={`absolute inset-0 bg-gradient-to-r ${isCinematic ? "from-[#050508] via-transparent to-[#050508] opacity-70" : "from-background via-transparent to-background opacity-50"}`} />
            <div className={`absolute inset-0 bg-gradient-to-b ${isCinematic ? "from-[#050508] via-transparent to-[#050508] opacity-60" : "from-background via-transparent to-background opacity-35"}`} />
          </motion.div>
        </div>
      )}

      {/* Large ambient backing glow that fades out naturally to the edges */}
      {!isCinematic && (
        <div
          className={`absolute w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none opacity-85 dark:opacity-60 transition-all duration-700 -z-10 ${theme.glow} ${
            imagePosition === "left" 
              ? "-left-40 top-1/2 -translate-y-1/2" 
              : "-right-40 top-1/2 -translate-y-1/2"
          }`}
        />
      )}

      <div className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
        {/* Content Side */}
        <div className={`flex-1 flex flex-col items-start text-left max-w-xl ${
          imagePosition === "left" ? "md:order-2" : ""
        }`}>
          {badge && (
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded border mb-2 ${theme.badgeBorder}`}>
              {badge}
            </span>
          )}

          <span className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${
            isCinematic ? "text-indigo-400" : "text-neutral-400 dark:text-neutral-500"
          }`}>
            {subtitle}
          </span>

          <h3 className={`text-lg sm:text-xl lg:text-2xl font-black uppercase tracking-tight leading-tight mb-2 ${
            isCinematic ? "text-white" : "text-neutral-900 dark:text-neutral-50"
          }`}>
            {title}
          </h3>

          <p className={`text-xs sm:text-sm leading-relaxed mb-4 font-normal ${
            isCinematic ? "text-neutral-400" : "text-neutral-550 dark:text-neutral-400"
          }`}>
            {description}
          </p>

          <Link href={ctaLink}>
            <button className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-md hover:translate-x-0.5 cursor-pointer ${theme.btnBg}`}>
              <span>{ctaText}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </Link>
        </div>

        {/* Image Side */}
        <div className={`w-full md:w-[200px] lg:w-[240px] shrink-0 flex items-center justify-center relative h-[120px] sm:h-[130px] md:h-[150px] ${
          imagePosition === "left" ? "md:order-1" : ""
        }`}>
          {/* Subtle backing platform glow */}
          {!isCinematic && (
            <div className={`absolute w-36 h-36 rounded-full blur-2xl opacity-60 pointer-events-none -z-10 ${theme.glow}`} />
          )}

          {/* Cinematic technical concentric vector light streaks/rays */}
          {isCinematic && (
            <motion.div
              className="absolute w-[200%] h-[200%] flex items-center justify-center pointer-events-none -z-10"
              animate={{
                opacity: [0.2, 0.4, 0.2],
                scale: [0.98, 1.02, 0.98],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <svg className="w-full h-full opacity-60" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Concentric dashed/solid tech rings */}
                <circle cx="200" cy="200" r="150" stroke="rgba(99, 102, 241, 0.12)" strokeWidth="1" strokeDasharray="3 6" />
                <circle cx="200" cy="200" r="110" stroke="rgba(129, 140, 248, 0.18)" strokeWidth="1" />
                <circle cx="200" cy="200" r="70" stroke="rgba(99, 102, 241, 0.25)" strokeWidth="1" strokeDasharray="5 5" />
                
                {/* Microscopic technical grid lines/rays */}
                <line x1="200" y1="50" x2="200" y2="350" stroke="rgba(99, 102, 241, 0.15)" strokeWidth="0.75" strokeDasharray="4 4" />
                <line x1="50" y1="200" x2="350" y2="200" stroke="rgba(99, 102, 241, 0.15)" strokeWidth="0.75" strokeDasharray="4 4" />
                <line x1="94" y1="94" x2="306" y2="306" stroke="rgba(129, 140, 248, 0.1)" strokeWidth="0.75" />
                <line x1="94" y1="306" x2="306" y2="94" stroke="rgba(129, 140, 248, 0.1)" strokeWidth="0.75" />
                
                {/* Hexagonal structural outer layout for premium tech detail */}
                <polygon points="200,60 321,130 321,270 200,340 79,270 79,130" stroke="rgba(99, 102, 241, 0.08)" strokeWidth="1" strokeDasharray="2 4" />
                <polygon points="200,90 295,145 295,255 200,310 105,255 105,145" stroke="rgba(99, 102, 241, 0.05)" strokeWidth="0.5" />
              </svg>
            </motion.div>
          )}

          <motion.div
            className="w-full h-full relative"
            animate={{
              y: [0, -8, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Image
              src={imageSrc}
              alt={imageAlt}
              fill
              className="object-contain p-2"
              sizes="(max-width: 768px) 100vw, 320px"
              priority={false}
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
