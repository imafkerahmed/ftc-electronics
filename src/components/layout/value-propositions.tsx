"use client";

import { useRef } from "react";
import RotatingTextComponent from "@/components/ui/RotatingText/RotatingText";

const RotatingText = RotatingTextComponent as React.ComponentType<{
  texts: string[];
  mainClassName?: string;
  staggerDuration?: number;
  splitBy?: string;
  transition?: { type: string; damping: number; stiffness: number };
  rotationInterval?: number;
}>;

export default function ValuePropositions({ config }: { config?: any }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const texts =
    config?.texts && config.texts.length > 0
      ? config.texts
      : [
          "WHY CHOOSE US",
          "100% GENUINE WARRANTY",
          "0% INTEREST INSTALLMENTS",
          "ISLANDWIDE SECURE LOGISTICS",
          "EXPERT TECH CURATION",
        ];

  const bodyContent =
    config?.content ||
    "As an authorized premium electronics distributor, we offer meticulously vetted hardware with direct manufacturer guarantees. We bridge the gap between engineering-grade quality and raw, reliable configuration performance.";

  return (
    <section
      ref={containerRef}
      className="w-full bg-white dark:bg-neutral-950 border-b border-border py-10 sm:py-16 lg:py-24 relative z-10 overflow-hidden"
    >
      {/* Subtle noise / dot texture background */}
      <div
        className="absolute inset-0 opacity-[0.025] dark:opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #000 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Decorative ambient blob */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] rounded-full blur-[100px] bg-blue-500/5 dark:bg-blue-500/8 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 flex flex-col items-center justify-center text-center relative z-10">
        {/* ── Large Rotating Text Title ── */}
        <div className="w-full max-w-5xl mb-2 sm:mb-4 flex flex-col items-center justify-center min-h-[55px] sm:min-h-[110px] lg:min-h-[150px]">
          <h2 className="text-3xl sm:text-5xl lg:text-7xl font-extrabold tracking-tight uppercase leading-none text-center">
            <RotatingText
              texts={texts}
              mainClassName="text-blue-600 dark:text-blue-500 font-black tracking-tight inline-flex justify-center text-center overflow-hidden py-2"
              staggerDuration={0.025}
              splitBy="characters"
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              rotationInterval={3500}
            />
          </h2>
        </div>

        {/* Philosophy paragraph */}
        <div className="max-w-2xl mx-auto">
          <p className="text-neutral-500 dark:text-neutral-400 text-sm sm:text-base leading-relaxed">
            {bodyContent}
          </p>
        </div>
      </div>
    </section>
  );
}
