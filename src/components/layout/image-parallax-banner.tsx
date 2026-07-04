"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "motion/react";
import { ArrowRight } from "lucide-react";

interface ImageParallaxBannerProps {
  imageSrc: string;
  alt: string;
  href: string;
  heightClass?: string;
  overlayText?: string;
  ctaLabel?: string;
}

export default function ImageParallaxBanner({
  imageSrc,
  alt,
  href,
  heightClass = "h-[160px] sm:h-[240px] md:h-[320px]",
  overlayText = "Discover Premium Tech Gear",
  ctaLabel = "Shop Now",
}: ImageParallaxBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], ["0%", "-22%"]);
  const overlayOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.5, 0.4, 0.55]);

  return (
    <div
      ref={containerRef}
      className={`w-full relative overflow-hidden group cursor-pointer ${heightClass}`}
    >
      <Link href={href} className="block w-full h-full">
        {/* Parallax image */}
        <motion.div
          style={{ y }}
          className="absolute top-0 inset-x-0 w-full h-[130%]"
        >
          <Image
            src={imageSrc}
            alt={alt}
            fill
            className="object-cover object-top"
            sizes="100vw"
            priority
          />
        </motion.div>

        {/* Dark gradient overlay */}
        <motion.div
          style={{ opacity: overlayOpacity }}
          className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent z-10 pointer-events-none"
        />

        {/* Right-side subtle light fade */}
        <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-black/20 to-transparent z-10 pointer-events-none" />

        {/* Text + CTA overlay */}
        <div className="absolute inset-0 z-20 flex items-center px-6 sm:px-12 lg:px-20">
          <div className="flex flex-col items-start gap-3 sm:gap-4">
            {/* Label */}
            <motion.span
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-white/70 text-[9px] sm:text-xs font-mono font-bold uppercase tracking-[0.2em]"
            >
              Featured Collection
            </motion.span>

            {/* Main text */}
            <motion.h2
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="text-white font-black text-lg sm:text-2xl md:text-3xl lg:text-4xl uppercase tracking-tight leading-tight max-w-lg drop-shadow-lg"
            >
              {overlayText}
            </motion.h2>

            {/* CTA Pill */}
            <motion.div
              initial={{ opacity: 0, x: -14 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex items-center gap-2"
            >
              <span className="group-hover:gap-3 inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 border border-white/25 hover:border-white/40 backdrop-blur-sm text-white text-xs sm:text-sm font-bold px-4 py-2 rounded-full transition-all duration-300">
                {ctaLabel}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </motion.div>
          </div>
        </div>

        {/* Hover shine sweep */}
        <div className="absolute inset-0 z-20 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none" />
      </Link>
    </div>
  );
}
