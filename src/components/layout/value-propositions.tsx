"use client";

import { useRef } from "react";
import { useInView } from "motion/react";
import RotatingTextComponent from "@/components/ui/RotatingText/RotatingText";

const RotatingText = RotatingTextComponent as any;

export default function ValuePropositions() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.1 });

  return (
    <section
      ref={containerRef}
      className="w-full bg-white dark:bg-background border-b border-border py-20 sm:py-28 relative z-10 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-16 flex flex-col items-center justify-center text-center">
        {/* Large Rotating Text Title */}
        <div className="w-full max-w-5xl mb-6 flex flex-col items-center justify-center min-h-[120px] sm:min-h-[160px] lg:min-h-[200px]">
          <h2 className="text-3xl sm:text-5xl lg:text-7xl font-extrabold tracking-tight uppercase leading-none text-center">
            <RotatingText
              texts={[
                "WHY CHOOSE US",
                "100% GENUINE WARRANTY",
                "0% INTEREST INSTALLMENTS",
                "ISLANDWIDE SECURE LOGISTICS",
                "EXPERT TECH CURATION",
              ]}
              mainClassName="text-blue-650 dark:text-blue-500 font-black tracking-tight inline-flex justify-center text-center overflow-hidden py-2"
              staggerDuration={0.025}
              splitBy="characters"
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              rotationInterval={3500}
            />
          </h2>
        </div>

        {/* Detailed philosophy paragraph */}
        <div className="max-w-2xl mx-auto mt-6">
          <p className="text-neutral-500 dark:text-neutral-400 text-sm sm:text-base leading-relaxed">
            As an authorized premium electronics distributor, we offer
            meticulously vetted hardware with direct manufacturer guarantees. We
            bridge the gap between engineering-grade quality and raw, reliable
            configuration performance.
          </p>
        </div>
      </div>
    </section>
  );
}
