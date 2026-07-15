"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

interface CampaignSlideConfig {
  eyebrow: string;
  titlePrefix?: string;
  titleHighlight: string;
  description: string;
  ctaText: string;
  ctaSecondary?: string;
  link: string;
  secondaryLink?: string;
  accentColor?: string;
  imageSrc?: string;
  imageAlt?: string;
}

interface CampaignHeroBannerConfig {
  slides?: CampaignSlideConfig[];
}

interface HeroSlide {
  eyebrow: string;
  titlePrefix: string;
  titleHighlight: string;
  description: string;
  ctaText: string;
  ctaSecondary?: string;
  link: string;
  secondaryLink?: string;
  accentColor: string;
  imageSrc: string;
  imageAlt: string;
}

// DB record type (matching PBHeroBanner shape from PocketBase)
// `image` = raw filename in PocketBase, `imageUrl` = full URL precomputed server-side
interface DBHeroBanner {
  id: string;
  collectionId: string;
  eyebrow: string;
  titlePrefix: string;
  titleHighlight: string;
  description: string;
  ctaText: string;
  ctaSecondary?: string;
  link: string;
  secondaryLink?: string;
  accentColor?: string;
  image?: string;
  imageUrl?: string;
  imageAlt?: string;
  sortOrder: number;
  isEnabled: boolean;
}

function dbBannerToSlide(banner: DBHeroBanner, index: number): HeroSlide {
  const accentDefaults = ["#111827", "#6d28d9", "#0891b2"];
  return {
    eyebrow: banner.eyebrow,
    titlePrefix: banner.titlePrefix ?? "",
    titleHighlight: banner.titleHighlight,
    description: banner.description,
    ctaText: banner.ctaText,
    ctaSecondary: banner.ctaSecondary,
    link: banner.link,
    secondaryLink: banner.secondaryLink ?? "/products",
    accentColor: banner.accentColor ?? accentDefaults[index % accentDefaults.length],
    imageSrc: banner.imageUrl ?? "",
    imageAlt: banner.imageAlt ?? banner.titleHighlight,
  };
}

function hasValidContent(slide: {
  titleHighlight?: string;
  eyebrow?: string;
  imageSrc?: string;
}) {
  return Boolean(
    (slide.titleHighlight && slide.titleHighlight.trim() !== "") ||
      (slide.eyebrow && slide.eyebrow.trim() !== "") ||
      (slide.imageSrc && slide.imageSrc.trim() !== ""),
  );
}

function buildSlides(
  dbSlides?: DBHeroBanner[],
  config?: CampaignHeroBannerConfig,
): HeroSlide[] {
  // Priority 1: DB slides fetched server-side
  if (dbSlides && dbSlides.length > 0) {
    const validDbSlides = dbSlides.filter((b) =>
      hasValidContent({
        titleHighlight: b.titleHighlight,
        eyebrow: b.eyebrow,
        imageSrc: b.imageUrl || b.image,
      }),
    );
    if (validDbSlides.length > 0) {
      return validDbSlides.map(dbBannerToSlide);
    }
  }

  // Priority 2: Config slides embedded in homepage_blocks config
  if (config?.slides && config.slides.length > 0) {
    const validConfigSlides = config.slides.filter((s) =>
      hasValidContent({
        titleHighlight: s.titleHighlight,
        eyebrow: s.eyebrow,
        imageSrc: s.imageSrc,
      }),
    );
    if (validConfigSlides.length > 0) {
      return validConfigSlides.map((slide, index) => ({
        eyebrow: slide.eyebrow,
        titlePrefix: slide.titlePrefix ?? "",
        titleHighlight: slide.titleHighlight,
        description: slide.description,
        ctaText: slide.ctaText,
        ctaSecondary: slide.ctaSecondary,
        link: slide.link,
        secondaryLink: slide.secondaryLink ?? "/products",
        accentColor:
          slide.accentColor ?? ["#111827", "#6d28d9", "#0891b2"][index % 3],
        imageSrc: slide.imageSrc ?? "",
        imageAlt: slide.imageAlt ?? slide.titleHighlight,
      }));
    }
  }

  // No valid slides configured → return empty array (renders null)
  return [];
}

export default function CampaignHeroBanner({
  config,
  dbSlides,
}: {
  config?: CampaignHeroBannerConfig;
  dbSlides?: DBHeroBanner[];
}) {
  const slides = buildSlides(dbSlides, config);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [direction, setDirection] = useState(1);

  const handleNext = useCallback(() => {
    if (slides.length === 0) return;
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const handlePrev = useCallback(() => {
    if (slides.length === 0) return;
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  const handleDotClick = (index: number) => {
    if (index === currentIndex) return;
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
  };

  useEffect(() => {
    if (!isPlaying || slides.length < 2) return;

    const timer = window.setTimeout(() => {
      handleNext();
    }, 6500);

    return () => window.clearTimeout(timer);
  }, [currentIndex, handleNext, isPlaying, slides.length]);

  if (slides.length === 0) {
    return null;
  }

  const activeSlide = slides[currentIndex];
  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 56 : -56,
      opacity: 0,
      filter: "blur(6px)",
    }),
    center: {
      x: 0,
      opacity: 1,
      filter: "blur(0px)",
      transition: {
        x: { type: "spring" as const, stiffness: 160, damping: 24 },
        opacity: { duration: 0.35 },
        filter: { duration: 0.35 },
      },
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -56 : 56,
      opacity: 0,
      filter: "blur(6px)",
      transition: {
        x: { type: "spring" as const, stiffness: 160, damping: 24 },
        opacity: { duration: 0.25 },
        filter: { duration: 0.25 },
      },
    }),
  };

  return (
    <section
      className="relative isolate overflow-hidden border-b border-slate-200/80 bg-gradient-to-b from-slate-100/90 via-slate-50/70 to-slate-100/90 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950"
      aria-label="Campaign Promotion Banner"
      onMouseEnter={() => setIsPlaying(false)}
      onMouseLeave={() => setIsPlaying(true)}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -top-24 right-10 h-96 w-96 rounded-full opacity-20 blur-3xl transition-colors duration-700"
          style={{ backgroundColor: activeSlide.accentColor }}
        />
        <div
          className="absolute bottom-0 left-10 h-80 w-80 rounded-full opacity-15 blur-3xl transition-colors duration-700"
          style={{ backgroundColor: activeSlide.accentColor }}
        />
      </div>

      <div className="relative mx-auto flex min-h-[460px] w-full max-w-7xl items-center px-6 py-10 sm:min-h-[500px] sm:py-14 lg:px-12 lg:py-16">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="grid w-full items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14"
          >
            <div className="max-w-2xl">
              <h1 className="max-w-xl text-4xl font-black leading-[0.94] tracking-[-0.05em] text-neutral-950 dark:text-neutral-50 sm:text-5xl lg:text-6xl">
                <span className="block whitespace-pre-line">
                  {activeSlide.titlePrefix}
                </span>
                <span style={{ color: activeSlide.accentColor }}>
                  {activeSlide.titleHighlight}
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-base leading-7 text-neutral-600 dark:text-neutral-400 sm:text-lg font-medium">
                {activeSlide.description}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href={activeSlide.link}
                  className="inline-flex items-center gap-2 rounded-full bg-neutral-950 dark:bg-white px-6 py-3.5 text-sm font-bold text-white dark:text-neutral-950 shadow-md transition-transform duration-200 hover:-translate-y-0.5"
                >
                  {activeSlide.ctaText}
                  <ArrowRight className="h-4 w-4" />
                </Link>

                {activeSlide.ctaSecondary && activeSlide.secondaryLink && (
                  <Link
                    href={activeSlide.secondaryLink}
                    className="inline-flex items-center gap-2 rounded-full border border-neutral-300 dark:border-neutral-700 bg-white/90 dark:bg-neutral-900/90 px-6 py-3.5 text-sm font-bold text-neutral-700 dark:text-neutral-200 shadow-xs transition-colors duration-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    {activeSlide.ctaSecondary}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>

            <div className="relative flex justify-center lg:justify-end">
              <div className="relative w-full max-w-[540px] aspect-[4/3] flex items-center justify-center">
                {activeSlide.imageSrc && (
                  <Image
                    src={activeSlide.imageSrc}
                    alt={activeSlide.imageAlt}
                    fill
                    className="object-contain p-2 mix-blend-multiply dark:mix-blend-screen transition-transform duration-500 hover:scale-105"
                    priority={currentIndex === 0}
                    sizes="(max-width: 1024px) 100vw, 540px"
                  />
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={handlePrev}
        className="absolute left-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-700 shadow-sm transition-transform duration-200 hover:-translate-y-1 sm:inline-flex"
        aria-label="Previous slide"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={handleNext}
        className="absolute right-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-neutral-700 shadow-sm transition-transform duration-200 hover:-translate-y-1 sm:inline-flex"
        aria-label="Next slide"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/90 px-3 py-2 shadow-sm">
        {slides.map((slide, index) => {
          const isActive = index === currentIndex;
          return (
            <button
              key={slide.titleHighlight + index}
              type="button"
              onClick={() => handleDotClick(index)}
              className={`h-2 rounded-full transition-all duration-300 ${
                isActive ? "w-8" : "w-2 bg-neutral-300 hover:bg-neutral-400"
              }`}
              style={{
                backgroundColor: isActive ? activeSlide.accentColor : undefined,
              }}
              aria-label={`Go to slide ${index + 1}`}
            />
          );
        })}
      </div>
    </section>
  );
}
