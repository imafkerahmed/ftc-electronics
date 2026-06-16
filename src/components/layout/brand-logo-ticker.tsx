"use client";

import Image from "next/image";
import { motion } from "motion/react";

interface BrandLogo {
  name: string;
  src: string;
  width: number;
  height: number;
}

const brandLogos: BrandLogo[] = [
  {
    name: "Apple",
    src: "/assets/brand-logos/apple.png",
    width: 32,
    height: 32,
  },
  {
    name: "Samsung",
    src: "/assets/brand-logos/samsung.png",
    width: 105,
    height: 28,
  },
  {
    name: "Anker",
    src: "/assets/brand-logos/anker.png",
    width: 95,
    height: 28,
  },
  {
    name: "Ugreen",
    src: "/assets/brand-logos/ugreen.png",
    width: 95,
    height: 28,
  },
  { name: "Wiwu", src: "/assets/brand-logos/wiwu.png", width: 85, height: 28 },
  {
    name: "Xiaomi",
    src: "/assets/brand-logos/xiaomi.png",
    width: 32,
    height: 32,
  },
];

export default function BrandLogoTicker({ className }: { className?: string }) {
  // Duplicate the brand logos list to create a seamless infinite marquee effect
  const duplicatedLogos = [
    ...brandLogos,
    ...brandLogos,
    ...brandLogos,
    ...brandLogos,
  ];

  return (
    <div
      className={`w-full border-b border-border bg-muted/5 h-[130px] overflow-hidden relative select-none z-10 flex items-center justify-center ${className}`}
    >
      {/* Soft overlay gradients on edges for premium visual fade */}
      <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-28 bg-gradient-to-r from-background to-transparent z-20 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-28 bg-gradient-to-l from-background to-transparent z-20 pointer-events-none" />

      {/* Scrolling Marquee Container */}
      <div className="flex w-full overflow-hidden">
        <motion.div
          className="flex items-center gap-16 sm:gap-24 pr-16 sm:pr-24 shrink-0"
          animate={{
            x: ["0%", "-50%"],
          }}
          transition={{
            x: {
              repeat: Infinity,
              repeatType: "loop",
              duration: 20,
              ease: "linear",
            },
          }}
        >
          {duplicatedLogos.map((logo, index) => (
            <div
              key={index}
              className="relative flex items-center justify-center opacity-100 hover:scale-105 transition-all duration-300 cursor-pointer w-[120px] h-[48px]"
            >
              <Image
                src={logo.src}
                alt={logo.name}
                width={logo.width}
                height={logo.height}
                className="object-contain pointer-events-none select-none"
              />
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
