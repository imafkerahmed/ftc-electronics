'use client';

import { useState, useRef, useEffect, useCallback, MouseEvent } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductGalleryProps {
  images: string[];
  name: string;
}

export default function ProductGallery({ images, name }: ProductGalleryProps) {
  const galleryImages = images && images.length > 0 ? images : ["/placeholder.jpg"];
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxScale, setLightboxScale] = useState(1);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const [isHovering, setIsHovering] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const diffX = touchStartX.current - touchEndX.current;
    if (diffX > 75) {
      handleNext();
    } else if (diffX < -75) {
      handlePrev();
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    setMousePos({ x, y });
  };

  const handleNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % galleryImages.length);
  }, [galleryImages.length]);

  const handlePrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
  }, [galleryImages.length]);

  // Lightbox keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLightboxOpen) return;
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'Escape') {
        setIsLightboxOpen(false);
        setLightboxScale(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, handleNext, handlePrev]);

  return (
    <div className="flex flex-col gap-4 w-full max-w-lg mx-auto select-none">
      {/* ── Active Main Image Container ── */}
      <div 
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => {
          setIsHovering(false);
          setMousePos({ x: 50, y: 50 });
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative overflow-hidden rounded-2xl aspect-[4/3] sm:aspect-square max-h-[400px] w-full group cursor-zoom-in flex items-center justify-center p-2"
      >
        {/* Fullscreen Zoom Trigger */}
        <button
          type="button"
          onClick={() => setIsLightboxOpen(true)}
          aria-label="Zoom Image"
          className="absolute right-3 top-3 z-20 p-2 rounded-full bg-white/80 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/80 text-neutral-800 dark:text-neutral-200 opacity-0 group-hover:opacity-100 transition-all hover:scale-105 shadow-md backdrop-blur-xs duration-200 cursor-pointer"
        >
          <Maximize2 className="h-4 w-4" />
        </button>

        {/* Main Image Stage */}
        <div className="relative w-full h-full pointer-events-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.25 }}
              className="w-full h-full"
            >
              <Image
                src={galleryImages[activeIndex]}
                alt={`${name} - View ${activeIndex + 1}`}
                fill
                priority={true}
                className={cn(
                  "object-contain p-2 transition-transform duration-150 ease-out origin-center",
                  isHovering ? "scale-125" : "scale-100"
                )}
                style={
                  isHovering
                    ? {
                        transformOrigin: `${mousePos.x}% ${mousePos.y}%`,
                      }
                    : undefined
                }
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Carousel arrows if multiple images */}
        {galleryImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              aria-label="Previous Image"
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-white/80 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/80 text-neutral-800 dark:text-neutral-200 hover:bg-white dark:hover:bg-neutral-800 transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer flex items-center justify-center opacity-0 group-hover:opacity-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              aria-label="Next Image"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-white/80 dark:bg-neutral-800/80 border border-neutral-200/80 dark:border-neutral-700/80 text-neutral-800 dark:text-neutral-200 hover:bg-white dark:hover:bg-neutral-800 transition-all hover:scale-105 active:scale-95 shadow-md cursor-pointer flex items-center justify-center opacity-0 group-hover:opacity-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* ── Thumbnails Row Under Main Image ── */}
      {galleryImages.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1 pt-1 scrollbar-none justify-center items-center w-full px-2">
          {galleryImages.map((img, idx) => {
            const isActive = activeIndex === idx;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={cn(
                  "relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-white dark:bg-neutral-900 border-2 transition-all p-1 cursor-pointer focus:outline-none",
                  isActive
                    ? "border-neutral-300 dark:border-neutral-600 shadow-sm ring-2 ring-neutral-300/40 dark:ring-neutral-600/40 scale-105"
                    : "border-neutral-200/60 dark:border-neutral-800/80 hover:border-neutral-300 dark:hover:border-neutral-700 opacity-60 hover:opacity-100"
                )}
              >
                <Image
                  src={img}
                  alt={`${name} Thumbnail ${idx + 1}`}
                  fill
                  sizes="80px"
                  className="object-contain p-1"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Lightbox / Zoom Modal */}
      <AnimatePresence>
        {isLightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4"
            onClick={() => {
              setIsLightboxOpen(false);
              setLightboxScale(1);
            }}
          >
            {/* Lightbox header controls */}
            <div className="absolute top-4 right-4 flex gap-3 z-55" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setLightboxScale((s) => Math.min(3, s + 0.25))}
                className="w-11 h-11 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer flex items-center justify-center"
                title="Zoom In"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setLightboxScale((s) => Math.max(1, s - 0.25))}
                className="w-11 h-11 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer flex items-center justify-center"
                title="Zoom Out"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLightboxOpen(false);
                  setLightboxScale(1);
                }}
                className="w-11 h-11 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer flex items-center justify-center"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Lightbox Main Image Container */}
            <div 
              className="relative w-full max-w-4xl h-[70vh] flex items-center justify-center overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div
                animate={{ scale: lightboxScale }}
                transition={{ type: 'spring', stiffness: 260, damping: 25 }}
                className="relative aspect-square max-h-full w-full max-w-full"
              >
                <Image
                  src={galleryImages[activeIndex]}
                  alt={`${name} Fullscreen`}
                  fill
                  className="object-contain rounded-lg"
                  sizes="100vw"
                />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
