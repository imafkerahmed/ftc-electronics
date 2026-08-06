"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

interface FeaturedItem {
  id: string;
  code: string;
  title: string;
  spec: string;
  price: string;
  image: string;
}

const featuredItems: FeaturedItem[] = [
  {
    id: "01",
    code: "KB-87",
    title: "Mechanical Keyboards",
    spec: "GASKET MOUNTED",
    price: "$189.00",
    image: "/assets/hero-keyboard.webp",
  },
  {
    id: "02",
    code: "ANC-01",
    title: "Studio Headsets",
    spec: "HYBRID ACTIVE NC",
    price: "$349.00",
    image: "/assets/hero-headphones.webp",
  },
  {
    id: "03",
    code: "ZP-16",
    title: "Pro Laptops",
    spec: "INTEL I9 + OLED",
    price: "$1,899.00",
    image: "/assets/hero-laptop.webp",
  },
];

export default function SplitFeatureGrid() {
  return (
    <section className="relative w-full bg-background overflow-hidden border-b border-border z-10">
      
      {/* 2-Column Desktop Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[calc(100vh-64px)] w-full">
        
        {/* Left Column (Sticky Panel) - Span 5 */}
        <div className="col-span-1 md:col-span-5 md:sticky md:top-16 md:h-[calc(100vh-64px)] flex flex-col justify-between p-8 sm:p-12 lg:p-16 bg-background border-b md:border-b-0 md:border-r border-border z-20">
          
          {/* Monospace Collection Badge */}
          <div>
            <span className="font-mono text-xs font-bold tracking-widest text-muted-foreground uppercase">
              COLLECTION 01 / DEY
            </span>
          </div>

          {/* Core Premium Headline */}
          <div className="my-10 md:my-0 max-w-sm">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-[1.05] uppercase">
              The Art of<br />Precision.
            </h1>
          </div>

          {/* Description & Blue CTA Button */}
          <div className="flex flex-col gap-6 max-w-sm">
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed">
              Curated high-performance gear designed for absolute efficiency. Experience the fusion of raw engineering power and clean, minimalist form.
            </p>
            <Link
              href="/products"
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 h-11 transition-all shadow-sm hover:shadow-md cursor-pointer gap-2 self-start active:translate-y-px"
            >
              Explore Gear
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

        </div>

        {/* Right Column (Scroll Snap Stack) - Span 7 */}
        <div className="col-span-1 md:col-span-7 md:h-[calc(100vh-64px)] md:overflow-y-auto md:snap-y md:snap-mandatory scrollbar-none flex flex-col divide-y divide-border bg-background">
          
          {featuredItems.map((item) => (
            <div
              key={item.id}
              className="w-full h-[400px] sm:h-[480px] md:h-[calc(100vh-64px)] md:snap-start flex-shrink-0 relative flex items-center justify-center p-8 sm:p-12 overflow-hidden bg-background"
              style={{
                backgroundImage: "radial-gradient(rgba(0, 0, 0, 0.08) 1.2px, transparent 1.2px)",
                backgroundSize: "24px 24px",
              }}
            >
              
              {/* Corner Info Overlays - Monospace Technical Specs */}
              
              {/* Top Left: Code / Index */}
              <div className="absolute top-6 left-6 font-mono text-[10px] tracking-widest text-muted-foreground uppercase select-none">
                {item.id} {"//"} {item.code}
              </div>

              {/* Top Right: Technical Spec Highlight */}
              <div className="absolute top-6 right-6 font-mono text-[10px] tracking-widest text-muted-foreground uppercase text-right select-none">
                {item.spec}
              </div>

              {/* Bottom Left: Title / Category */}
              <div className="absolute bottom-6 left-6 font-mono text-[10px] tracking-widest text-foreground font-bold uppercase select-none">
                {item.title}
              </div>

              {/* Bottom Right: Dynamic Price Tag */}
              <div className="absolute bottom-6 right-6 font-mono text-[10px] tracking-widest text-muted-foreground uppercase text-right select-none">
                EST. {item.price}
              </div>

              {/* Center Product Showcase (Spacious Dash Border Placeholder Box) */}
              <div className="w-[85%] h-[68%] border border-border border-dashed rounded-2xl flex items-center justify-center relative p-6 bg-background/50 backdrop-blur-xs transition-colors duration-300 hover:bg-neutral-50/20">
                <motion.div
                  className="relative w-full h-full max-w-[240px] max-h-[240px] sm:max-w-[320px] sm:max-h-[320px] lg:max-w-[380px] lg:max-h-[380px] flex items-center justify-center"
                  whileHover={{ y: -8, scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 350, damping: 20 }}
                >
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    priority
                    sizes="(max-width: 640px) 240px, (max-width: 1024px) 320px, 380px"
                    className="object-contain filter drop-shadow-[0_15px_30px_rgba(0,0,0,0.05)] pointer-events-none select-none"
                  />
                </motion.div>
              </div>

            </div>
          ))}

        </div>

      </div>
    </section>
  );
}
