"use client";

import Link from "next/link";
import { ArrowRight, Laptop, Smartphone, Keyboard, Headphones } from "lucide-react";
import { motion } from "motion/react";
import InteractiveGridBackground from "@/components/lightswind/interactive-grid-background";

export default function CategoryBentoGrid() {
  return (
    <section className="w-full py-16 sm:py-24 border-b border-border bg-white dark:bg-neutral-950 text-foreground dark:text-white relative z-10 overflow-hidden">
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
          fadeColor="bg-white dark:bg-neutral-950"
        />
      </div>

      <div className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-16 relative z-10">
        
        {/* Asymmetric Responsive Grid Structure */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
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
                  initial: { y: 0, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" },
                  hover: { y: -6, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15)" }
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="relative bg-white rounded-[24px] border border-neutral-200/80 h-[220px] sm:h-[260px] overflow-hidden p-6 sm:p-8 flex flex-col justify-between"
              >
                {/* Left Content */}
                <div className="z-10 max-w-[50%] flex flex-col items-start">
                  <span className="font-mono text-[10px] tracking-widest text-neutral-400 uppercase font-bold">
                    LAPTOPS
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-neutral-900 uppercase tracking-tight mt-2 leading-none">
                    Laptops & Computing
                  </h3>
                  <p className="text-xs sm:text-sm text-neutral-500 mt-2 leading-relaxed font-medium">
                    High-Performance Workstations
                  </p>
                  
                  {/* Shop Now CTA link */}
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 group-hover:text-blue-600 mt-6 transition-colors duration-300">
                    <span>Shop Now</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </div>

                {/* Right Image Container */}
                <div className="absolute top-0 right-0 h-full w-[45%] overflow-hidden flex items-center justify-center">
                  <motion.div
                    variants={{
                      initial: { scale: 0.8, opacity: 0 },
                      animate: { 
                        scale: 1, 
                        opacity: 1,
                        transition: { duration: 0.5 }
                      },
                      hover: { 
                        scale: 1.1, 
                        y: -4, 
                        transition: { type: "spring", stiffness: 300, damping: 15 } 
                      }
                    }}
                    className="flex items-center justify-center"
                  >
                    <Laptop className="w-28 h-28 sm:w-36 sm:h-36 text-blue-600" strokeWidth={1.5} />
                  </motion.div>
                </div>
              </motion.div>
            </Link>

            {/* Bottom Row Stack: Keyboards & Audio */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              
              {/* Keyboards Card */}
              <Link href="/products?category=keyboards" className="group block">
                <motion.div
                  initial="initial"
                  whileInView="animate"
                  whileHover="hover"
                  viewport={{ once: true, amount: 0.2 }}
                  variants={{
                    initial: { y: 0, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" },
                    hover: { y: -6, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15)" }
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="relative bg-white rounded-[24px] border border-neutral-200/80 h-[220px] sm:h-[260px] overflow-hidden p-6 sm:p-8 flex flex-col justify-between"
                >
                  {/* Content */}
                  <div className="z-10 max-w-[60%] flex flex-col items-start">
                    <span className="font-mono text-[10px] tracking-widest text-neutral-400 uppercase font-bold">
                      KEYBOARDS
                    </span>
                    <h3 className="text-lg sm:text-xl font-black text-neutral-900 uppercase tracking-tight mt-2 leading-none">
                      Keyboards
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed font-medium">
                      Mechanical Keyboards
                    </p>
                    
                    {/* Shop Now CTA link */}
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 group-hover:text-slate-600 mt-6 transition-colors duration-300">
                      <span>Shop Now</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </div>
                  </div>

                  {/* Animated Keyboard Vector */}
                  <div className="absolute right-6 bottom-6 select-none pointer-events-none">
                    <motion.div
                      variants={{
                        initial: { scale: 0.8, opacity: 0 },
                        animate: { 
                          scale: 1, 
                          opacity: 1,
                          transition: { duration: 0.5 }
                        },
                        hover: { 
                          scale: 1.1, 
                          transition: { type: "spring", stiffness: 300, damping: 15 } 
                        }
                      }}
                    >
                      <Keyboard className="w-16 h-16 sm:w-20 sm:h-20 text-slate-600" strokeWidth={1.5} />
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
                    initial: { y: 0, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" },
                    hover: { y: -6, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15)" }
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="relative bg-white rounded-[24px] border border-neutral-200/80 h-[220px] sm:h-[260px] overflow-hidden p-6 sm:p-8 flex flex-col justify-between"
                >
                  {/* Content */}
                  <div className="z-10 max-w-[60%] flex flex-col items-start">
                    <span className="font-mono text-[10px] tracking-widest text-neutral-400 uppercase font-bold">
                      AUDIO
                    </span>
                    <h3 className="text-lg sm:text-xl font-black text-neutral-900 uppercase tracking-tight mt-2 leading-none">
                      Audio & Sound
                    </h3>
                    <p className="text-xs text-neutral-500 mt-1.5 leading-relaxed font-medium">
                      Premium Sound Equipment
                    </p>
                    
                    {/* Shop Now CTA link */}
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 group-hover:text-rose-600 mt-6 transition-colors duration-300">
                      <span>Shop Now</span>
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </div>
                  </div>

                  {/* Animated Headphones Vector */}
                  <div className="absolute right-6 bottom-6 select-none pointer-events-none">
                    <motion.div
                      variants={{
                        initial: { scale: 0.8, opacity: 0 },
                        animate: { 
                          scale: 1, 
                          opacity: 1,
                          transition: { duration: 0.5 }
                        },
                        hover: { 
                          scale: [1, 1.08, 1],
                          transition: { duration: 0.8, repeat: Infinity, ease: "easeInOut" as const }
                        }
                      }}
                    >
                      <Headphones className="w-16 h-16 sm:w-20 sm:h-20 text-rose-600" strokeWidth={1.5} />
                    </motion.div>
                  </div>
                </motion.div>
              </Link>

            </div>

          </div>

          {/* Right Column: Smartphones (Spans 4, full height) */}
          <div className="lg:col-span-4 h-full">
            <Link href="/products?category=phones" className="group block h-full">
              <motion.div
                initial="initial"
                whileInView="animate"
                whileHover="hover"
                viewport={{ once: true, amount: 0.2 }}
                variants={{
                  initial: { y: 0, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" },
                  hover: { y: -6, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15)" }
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="relative bg-white rounded-[24px] border border-neutral-200/80 h-full min-h-[350px] lg:min-h-[544px] overflow-hidden p-6 sm:p-8 flex flex-col justify-between"
              >
                {/* Top Content */}
                <div className="z-10 flex flex-col items-start">
                  <span className="font-mono text-[10px] tracking-widest text-neutral-400 uppercase font-bold">
                    PHONES
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-neutral-900 uppercase tracking-tight mt-2 leading-none">
                    Smartphones
                  </h3>
                  <p className="text-xs sm:text-sm text-neutral-500 mt-2 leading-relaxed font-medium">
                    Flagship Mobile Devices
                  </p>
                  
                  {/* Shop Now CTA link */}
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400 group-hover:text-emerald-600 mt-6 transition-colors duration-300">
                    <span>Shop Now</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </div>
                </div>

                {/* Smartphone Icon Wrapper - Flex container to prevent overflow, scales down micro-proportionally */}
                <div className="flex-grow w-full flex items-center justify-center select-none pointer-events-none mt-6 max-h-[50%] sm:max-h-[55%] md:max-h-[60%]">
                  <motion.div
                    variants={{
                      initial: { scale: 0.8, opacity: 0 },
                      animate: { 
                        scale: 1, 
                        opacity: 1,
                        transition: { duration: 0.5 }
                      },
                      hover: { 
                        scale: 1.08, 
                        y: -5,
                        rotate: [0, -2, 2, -2, 0],
                        transition: { 
                          y: { type: "spring", stiffness: 300, damping: 15 },
                          rotate: { duration: 0.4, ease: "easeInOut" }
                        }
                      }
                    }}
                    className="h-full w-full flex items-center justify-center"
                  >
                    <Smartphone className="w-auto h-full max-h-[130px] sm:max-h-[180px] lg:max-h-[220px] text-emerald-600 object-contain" strokeWidth={1.5} />
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
