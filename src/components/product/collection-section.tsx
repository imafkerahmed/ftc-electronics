'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, useInView } from 'motion/react';
import { Product } from '@/types/product';
import CollectionProductCard from './collection-product-card';

interface CollectionSectionProps {
  title: string;
  subtitle?: string;
  badgeBgColor?: string;
  seeAllLink?: string;
  layout: 'carousel' | 'grid';
  products: Product[];
}

export default function CollectionSection({
  title,
  subtitle,
  badgeBgColor = 'bg-[#ff0000]',
  seeAllLink = '/products',
  layout,
  products,
}: CollectionSectionProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.1 });
  
  // Navigation button states
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Check scroll positions to enable/disable arrow buttons
  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 5);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 5);
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScroll);
      // Run once on load/render
      checkScroll();
      
      // Also listen to window resize
      window.addEventListener('resize', checkScroll);
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', checkScroll);
      }
      window.removeEventListener('resize', checkScroll);
    };
  }, [products]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      // Scroll by 1 card width + gap (approx 280-320px depending on screen)
      const scrollAmount = container.clientWidth * 0.75;
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (products.length === 0) return null;

  return (
    <div 
      ref={containerRef}
      className="w-full py-10 sm:py-14 border-b border-border bg-background relative z-10"
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 flex flex-col md:flex-row gap-8 md:gap-6 lg:gap-10">
        
        {/* Left Column: Title & Collection Details */}
        <motion.div 
          className="w-full md:w-[180px] lg:w-[220px] shrink-0 flex flex-col items-start justify-center text-left"
          initial={{ opacity: 0, x: -20 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {/* Tagline Badge */}
          {subtitle && (
            <span className={`rounded-[2px] ${badgeBgColor} px-2 py-0.5 text-[9px] font-extrabold text-white uppercase tracking-wider mb-2.5`}>
              {subtitle}
            </span>
          )}

          {/* Section Main Title */}
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50 uppercase leading-snug">
            {title.match(/^([^\s-]+[\s-]*)(.*)$/) ? (
              <>
                {title.match(/^([^\s-]+[\s-]*)(.*)$/)![1]}
                <span className="text-blue-600">
                  {title.match(/^([^\s-]+[\s-]*)(.*)$/)![2]}
                </span>
              </>
            ) : (
              title
            )}
          </h2>

          {/* See All link */}
          <Link 
            href={seeAllLink}
            className="group mt-2.5 flex items-center text-xs font-semibold text-neutral-400 hover:text-blue-600 transition-colors duration-200"
          >
            <span>See All</span>
            <ChevronRight className="h-3 w-3 ml-0.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </motion.div>

        {/* Right Column: Products Display */}
        <div className="flex-grow min-w-0 flex flex-col justify-center">
          {layout === 'grid' ? (
            /* Grid Display */
            <motion.div 
              className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-7 md:gap-x-5 md:gap-y-9"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {products.map((product, idx) => (
                <CollectionProductCard key={product.id || idx} product={product} />
              ))}
            </motion.div>
          ) : (
            /* Carousel Display */
            <div className="relative w-full">
              <motion.div 
                ref={scrollContainerRef}
                className="flex gap-4 sm:gap-5 overflow-x-auto scrollbar-none snap-x snap-mandatory pb-2 touch-pan-x"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                {products.map((product, idx) => (
                  <div 
                    key={product.id || idx}
                    className="w-[calc((100%-16px)/2)] sm:w-[calc((100%-32px)/3)] lg:w-[calc((100%-48px)/4)] shrink-0 snap-start"
                  >
                    <CollectionProductCard product={product} />
                  </div>
                ))}
              </motion.div>

              {/* Navigation Arrows placed bottom right inside container */}
              <div className="flex justify-end items-center gap-2 mt-4 pr-1">
                <button
                  onClick={() => handleScroll('left')}
                  disabled={!canScrollLeft}
                  className={`h-7 w-7 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                    canScrollLeft 
                      ? 'border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:border-neutral-500 dark:hover:bg-neutral-900 text-neutral-800 dark:text-neutral-200' 
                      : 'border-neutral-200 dark:border-neutral-800 text-neutral-300 dark:text-neutral-700 opacity-50 cursor-not-allowed'
                  }`}
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleScroll('right')}
                  disabled={!canScrollRight}
                  className={`h-7 w-7 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                    canScrollRight 
                      ? 'border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:border-neutral-500 dark:hover:bg-neutral-900 text-neutral-800 dark:text-neutral-200' 
                      : 'border-neutral-200 dark:border-neutral-800 text-neutral-300 dark:text-neutral-700 opacity-50 cursor-not-allowed'
                  }`}
                  aria-label="Scroll right"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
