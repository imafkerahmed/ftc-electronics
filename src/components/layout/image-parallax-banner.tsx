"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, useScroll, useTransform } from "motion/react";

interface ImageParallaxBannerProps {
  imageSrc: string;
  alt: string;
  href: string;
  heightClass?: string;
}

export default function ImageParallaxBanner({
  imageSrc,
  alt,
  href,
  heightClass = "h-[120px] sm:h-[160px] md:h-[200px]",
}: ImageParallaxBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Track scroll progress of the container relative to the viewport
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // Map scroll progress to a slow vertical translate y offset
  // Starts at 0% (top aligned) and shifts up to -23% (bottom aligned) as scroll progresses.
  // At scroll progress = 0.5 (middle of scroll), this perfectly centers the image content.
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "-23%"]);

  return (
    <div
      ref={containerRef}
      className={`w-full relative overflow-hidden ${heightClass}`}
    >
      <Link href={href} className="block w-full h-full cursor-pointer">
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
      </Link>
    </div>
  );
}
