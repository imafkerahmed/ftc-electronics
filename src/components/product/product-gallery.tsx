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
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxScale, setLightboxScale] = useState(1);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
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
    setActiveIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const handlePrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

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
    <div className="flex flex-col gap-4 w-full">
      {/* Active Image Container */}
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
        className="relative overflow-hidden rounded-2xl border border-border bg-card/40 backdrop-blur-sm aspect-square w-full group cursor-zoom-in"
      >
        {/* Actions panel */}
        <button
          onClick={() => setIsLightboxOpen(true)}
          aria-label="Zoom Image"
          className="absolute right-4 top-4 z-10 p-2.5 rounded-full bg-background/80 dark:bg-card/90 border border-border/80 text-foreground opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg backdrop-blur-xs duration-300"
        >
          <Maximize2 className="h-4.5 w-4.5" />
        </button>

        {/* Hover zoom magnifier container */}
        <div className="relative w-full h-full pointer-events-none">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full"
            >
              <Image
                src={images[activeIndex]}
                alt={`${name} - View ${activeIndex + 1}`}
                fill
                priority={true}
                className={cn(
                  "object-cover transition-transform duration-100 ease-out origin-center",
                  isHovering ? "scale-135" : "scale-100"
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
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              aria-label="Previous Image"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-background/60 dark:bg-card/70 border border-border text-foreground hover:bg-background/90 dark:hover:bg-card/90 transition-all hover:scale-105 active:scale-95 hidden md:flex items-center justify-center"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              aria-label="Next Image"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-background/60 dark:bg-card/70 border border-border text-foreground hover:bg-background/90 dark:hover:bg-card/90 transition-all hover:scale-105 active:scale-95 hidden md:flex items-center justify-center"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnails Row */}
      {images.length > 1 && (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIndex(idx)}
              className={cn(
                "relative flex-shrink-0 w-20 aspect-square rounded-xl overflow-hidden border bg-card/60 cursor-pointer transition-all hover:opacity-90",
                activeIndex === idx ? "border-primary" : "border-border"
              )}
            >
              <Image
                src={img}
                alt={`${name} Thumbnail ${idx + 1}`}
                fill
                sizes="80px"
                className="object-cover"
              />
              {activeIndex === idx && (
                <motion.div 
                  layoutId="activeThumbnailBorder"
                  className="absolute inset-0 border-2 border-blue-500 rounded-xl pointer-events-none z-10"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          ))}
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
                onClick={() => setLightboxScale((s) => Math.min(3, s + 0.25))}
                className="w-11 h-11 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer flex items-center justify-center"
                title="Zoom In"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
              <button
                onClick={() => setLightboxScale((s) => Math.max(1, s - 0.25))}
                className="w-11 h-11 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors cursor-pointer flex items-center justify-center"
                title="Zoom Out"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <button
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
                  src={images[activeIndex]}
                  alt={`${name} Fullscreen`}
                  fill
                  className="object-contain rounded-lg"
                  sizes="100vw"
                  priority={true}
                />
              </motion.div>

              {/* Lightbox Navigation Buttons */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={handlePrev}
                    className="absolute left-2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    onClick={handleNext}
                    className="absolute right-2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>

            {/* Lightbox Thumbnails Bottom Selector */}
            {images.length > 1 && (
              <div 
                className="flex gap-2 mt-8 z-55 overflow-x-auto max-w-xl pb-2"
                onClick={(e) => e.stopPropagation()}
              >
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveIndex(idx)}
                    className={cn(
                      "relative w-14 aspect-square rounded-lg overflow-hidden border bg-white/5 hover:opacity-90 transition-all cursor-pointer",
                      activeIndex === idx ? "border-blue-500 scale-105" : "border-white/10"
                    )}
                  >
                    <Image
                      src={img}
                      alt={`Thumb ${idx}`}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
