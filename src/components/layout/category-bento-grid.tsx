"use client";

import Link from "next/link";
import {
  ArrowRight,
  Laptop,
  Smartphone,
  Keyboard,
  Headphones,
} from "lucide-react";
import { motion } from "motion/react";
import InteractiveGridBackground from "@/components/lightswind/interactive-grid-background";

export default function CategoryBentoGrid() {
  return (
    <section className="w-full py-8 sm:py-16 lg:py-24 border-b border-border bg-zinc-50 dark:bg-neutral-950 text-foreground dark:text-white relative z-10 overflow-hidden">
      {/* Background Interactive Grid */}
      <div className="absolute inset-0 z-0 opacity-100 pointer-events-none w-full h-full">
        <InteractiveGridBackground
          className="w-full h-full"
          gridSize={48}
          darkGridColor="#161618"
          darkEffectColor="rgba(23, 62, 255, 0.25)"
          glow={true}
          glowRadius={15}
          showFade={true}
          fadeIntensity={10}
          fadeColor="bg-zinc-50 dark:bg-neutral-950"
        />
      </div>

      <div className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 relative z-10">
        {/* Asymmetric Responsive Grid Structure */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch">
          {/* Left Column (stacks Laptops horizontally over Keyboards and Audio grids) - Span 8 */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Laptops & Computing (Horizontal Card) */}
            <Link href="/products?category=laptops" className="group block">
              <motion.div
                initial="initial"
                whileInView="animate"
                whileHover="hover"
                viewport={{ once: true, amount: 0.2 }}
                variants={{
                  initial: {
                    y: 0,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                  },
                  hover: {
                    y: -6,
                    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
                  },
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="relative bg-white/75 dark:bg-neutral-900/40 rounded-[24px] border border-neutral-200/60 dark:border-white/5 h-[125px] sm:h-[220px] lg:h-[260px] overflow-hidden p-4 sm:p-6 lg:p-8 flex flex-col justify-between backdrop-blur-md transition-colors"
              >
                {/* Left Content */}
                <div className="z-10 max-w-[50%] flex flex-col items-start">
                  <span className="font-mono text-[10px] tracking-widest text-neutral-400 dark:text-neutral-500 uppercase font-bold">
                    LAPTOPS
                  </span>
                  <h3 className="text-lg sm:text-2xl font-black text-neutral-900 dark:text-white uppercase tracking-tight mt-1.5 sm:mt-2 leading-none">
                    Laptops & Computing
                  </h3>
                  <p className="text-[11px] sm:text-sm text-neutral-550 dark:text-neutral-400 mt-1 sm:mt-2 leading-relaxed font-medium">
                    High-Performance Workstations
                  </p>

                  {/* Shop Now CTA link */}
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 dark:text-neutral-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 mt-3 sm:mt-6 transition-colors duration-300">
                    <span>Shop Now</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </div>

                {/* Right Image Container */}
                <div className="absolute top-0 right-0 h-full w-[45%] overflow-hidden flex items-center justify-center">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 sm:w-36 sm:h-36 rounded-full bg-blue-500/10 dark:bg-blue-500/5 blur-[25px] pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                  <motion.div
                    variants={{
                      initial: { scale: 0.8, opacity: 0 },
                      animate: {
                        scale: 1,
                        opacity: 1,
                        transition: { duration: 0.5 },
                      },
                      hover: {
                        scale: 1.1,
                        y: -4,
                        transition: {
                          type: "spring",
                          stiffness: 300,
                          damping: 15,
                        },
                      },
                    }}
                    className="flex items-center justify-center"
                  >
                    <Laptop
                      className="w-16 h-16 sm:w-28 lg:w-36 sm:h-28 lg:h-36 text-blue-600"
                      strokeWidth={1.5}
                    />
                  </motion.div>
                </div>
              </motion.div>
            </Link>

            {/* Bottom Row Stack: Keyboards & Audio */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {/* Keyboards Card */}
              <Link href="/products?category=keyboards" className="group block">
                <motion.div
                  initial="initial"
                  whileInView="animate"
                  whileHover="hover"
                  viewport={{ once: true, amount: 0.2 }}
                  variants={{
                    initial: {
                      y: 0,
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                    },
                    hover: {
                      y: -6,
                      boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
                    },
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="relative bg-white/75 dark:bg-neutral-900/40 rounded-[24px] border border-neutral-200/60 dark:border-white/5 h-[125px] sm:h-[220px] lg:h-[260px] overflow-hidden p-4 sm:p-6 lg:p-8 flex flex-col justify-between backdrop-blur-md transition-colors"
                >
                  {/* Content */}
                  <div className="z-10 max-w-[60%] flex flex-col items-start">
                    <span className="font-mono text-[10px] tracking-widest text-neutral-400 dark:text-neutral-500 uppercase font-bold">
                      KEYBOARDS
                    </span>
                    <h3 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white uppercase tracking-tight mt-1.5 sm:mt-2 leading-none">
                      Keyboards
                    </h3>
                    <p className="text-[11px] sm:text-xs text-neutral-550 dark:text-neutral-400 mt-1 sm:mt-1.5 leading-relaxed font-medium">
                      Mechanical Keyboards
                    </p>

                    {/* Shop Now CTA link */}
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 dark:text-neutral-500 group-hover:text-slate-600 dark:group-hover:text-neutral-300 mt-3 sm:mt-6 transition-colors duration-300">
                      <span>Shop Now</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </div>
                  </div>

                  {/* Animated Keyboard Vector */}
                  <div className="absolute right-4 bottom-4 sm:right-6 sm:bottom-6 lg:right-8 lg:bottom-8 select-none pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-slate-500/10 dark:bg-neutral-400/5 blur-[20px] pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    <motion.div
                      variants={{
                        initial: { scale: 0.8, opacity: 0 },
                        animate: {
                          scale: 1,
                          opacity: 1,
                          transition: { duration: 0.5 },
                        },
                        hover: {
                          scale: 1.1,
                          transition: {
                            type: "spring",
                            stiffness: 300,
                            damping: 15,
                          },
                        },
                      }}
                    >
                      <Keyboard
                        className="w-12 h-12 sm:w-16 lg:w-20 sm:h-16 lg:h-20 text-slate-600 dark:text-neutral-300"
                        strokeWidth={1.5}
                      />
                    </motion.div>
                  </div>
                </motion.div>
              </Link>

              {/* Audio & Sound Card */}
              <Link href="/products?category=audio" className="group block">
                <motion.div
                  initial="initial"
                  whileInView="animate"
                  whileHover="hover"
                  viewport={{ once: true, amount: 0.2 }}
                  variants={{
                    initial: {
                      y: 0,
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                    },
                    hover: {
                      y: -6,
                      boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
                    },
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="relative bg-white/75 dark:bg-neutral-900/40 rounded-[24px] border border-neutral-200/60 dark:border-white/5 h-[125px] sm:h-[220px] lg:h-[260px] overflow-hidden p-4 sm:p-6 lg:p-8 flex flex-col justify-between backdrop-blur-md transition-colors"
                >
                  {/* Content */}
                  <div className="z-10 max-w-[60%] flex flex-col items-start">
                    <span className="font-mono text-[10px] tracking-widest text-neutral-400 dark:text-neutral-500 uppercase font-bold">
                      AUDIO
                    </span>
                    <h3 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white uppercase tracking-tight mt-1.5 sm:mt-2 leading-none">
                      Audio & Sound
                    </h3>
                    <p className="text-[11px] sm:text-xs text-neutral-550 dark:text-neutral-400 mt-1 sm:mt-1.5 leading-relaxed font-medium">
                      Premium Sound Equipment
                    </p>

                    {/* Shop Now CTA link */}
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 dark:text-neutral-500 group-hover:text-rose-600 dark:group-hover:text-rose-450 mt-3 sm:mt-6 transition-colors duration-300">
                      <span>Shop Now</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </div>
                  </div>

                  {/* Animated Headphones Vector */}
                  <div className="absolute right-4 bottom-4 sm:right-6 sm:bottom-6 lg:right-8 lg:bottom-8 select-none pointer-events-none">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-rose-500/10 dark:bg-rose-500/5 blur-[20px] pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                    <motion.div
                      variants={{
                        initial: { scale: 0.8, opacity: 0 },
                        animate: {
                          scale: 1,
                          opacity: 1,
                          transition: { duration: 0.5 },
                        },
                        hover: {
                          scale: [1, 1.08, 1],
                          transition: {
                            duration: 0.8,
                            repeat: Infinity,
                            ease: "easeInOut",
                          },
                        },
                      }}
                    >
                      <Headphones
                        className="w-12 h-12 sm:w-16 lg:w-20 sm:h-16 lg:h-20 text-rose-600"
                        strokeWidth={1.5}
                      />
                    </motion.div>
                  </div>
                </motion.div>
              </Link>
            </div>
          </div>

          {/* Right Column: Smartphones (Spans 4, full height) */}
          <div className="lg:col-span-4 h-full">
            <Link
              href="/products?category=phones"
              className="group block h-full"
            >
              <motion.div
                initial="initial"
                whileInView="animate"
                whileHover="hover"
                viewport={{ once: true, amount: 0.2 }}
                variants={{
                  initial: {
                    y: 0,
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                  },
                  hover: {
                    y: -6,
                    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
                  },
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="relative bg-white/75 dark:bg-neutral-900/40 rounded-[24px] border border-neutral-200/60 dark:border-white/5 h-[125px] sm:h-full sm:min-h-[350px] lg:min-h-[544px] overflow-hidden p-4 sm:p-6 lg:p-8 flex flex-col justify-between backdrop-blur-md transition-colors"
              >
                {/* Top Content */}
                <div className="z-10 max-w-[55%] sm:max-w-none flex flex-col items-start">
                  <span className="font-mono text-[10px] tracking-widest text-neutral-400 dark:text-neutral-500 uppercase font-bold">
                    PHONES
                  </span>
                  <h3 className="text-lg sm:text-2xl font-black text-neutral-900 dark:text-white uppercase tracking-tight mt-1.5 sm:mt-2 leading-none">
                    Smartphones
                  </h3>
                  <p className="text-[11px] sm:text-sm text-neutral-550 dark:text-neutral-400 mt-1 sm:mt-2 leading-relaxed font-medium">
                    Flagship Mobile Devices
                  </p>

                  {/* Shop Now CTA link */}
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 dark:text-neutral-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-450 mt-3 sm:mt-6 transition-colors duration-300">
                    <span>Shop Now</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </div>

                {/* Smartphone Icon Wrapper - Flex container to prevent overflow, scales down micro-proportionally */}
                <div className="absolute right-4 bottom-4 sm:relative sm:right-0 sm:bottom-0 sm:flex-grow w-[35%] sm:w-full flex items-center justify-end sm:items-center sm:justify-center select-none pointer-events-none mt-0 sm:mt-6 h-[70px] sm:h-auto max-h-[50%] sm:max-h-[55%] md:max-h-[60%]">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 sm:w-36 sm:h-36 rounded-full bg-emerald-500/10 dark:bg-emerald-500/5 blur-[25px] pointer-events-none group-hover:scale-125 transition-transform duration-500" />
                  <motion.div
                    variants={{
                      initial: { scale: 0.8, opacity: 0 },
                      animate: {
                        scale: 1,
                        opacity: 1,
                        transition: { duration: 0.5 },
                      },
                      hover: {
                        scale: 1.08,
                        y: -5,
                        rotate: [0, -2, 2, -2, 0],
                        transition: {
                          y: { type: "spring", stiffness: 300, damping: 15 },
                          rotate: { duration: 0.4, ease: "easeInOut" },
                        },
                      },
                    }}
                    className="h-full w-full flex items-center justify-end sm:items-center sm:justify-center"
                  >
                    <Smartphone
                      className="w-auto h-full max-h-[60px] sm:max-h-[180px] lg:max-h-[220px] text-emerald-600 object-contain"
                      strokeWidth={1.5}
                    />
                  </motion.div>
                </div>
              </motion.div>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
