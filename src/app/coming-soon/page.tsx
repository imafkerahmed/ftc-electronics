"use client";

import * as React from "react";
import TrueFocus from "@/components/ui/TrueFocus/TrueFocus";

export default function ComingSoon() {
  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-between overflow-x-hidden bg-background text-foreground font-sans px-4 py-8 sm:px-6 md:px-8">
      {/* Premium Background Grid & Gradients */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.08),rgba(255,255,255,0))] dark:bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.12),rgba(0,0,0,0))]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(120,119,198,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(120,119,198,0.02)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_80%,transparent_100%)]" />

      {/* Header */}
      <header className="w-full max-w-7xl flex items-center justify-between py-6">
        <div className="flex items-center cursor-pointer">
          <span className="font-bold tracking-tight text-lg sm:text-xl">
            FTC{" "}
            <span className="font-normal text-muted-foreground">
              / ELECTRONICS
            </span>
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-2xl flex flex-col items-center justify-center text-center flex-1 py-12 sm:py-16 md:py-24 gap-8 sm:gap-12">
        {/* Hero Headline & Subtitle */}
        <div className="space-y-4 max-w-2xl">
          <div className="inline-block rounded-lg px-3 py-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase bg-secondary/50 border border-border">
            COMING SOON
          </div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] pb-1">
            <TrueFocus
              sentence="FTC ELECTRONICS"
              borderColor="currentColor"
              glowColor="rgba(120, 119, 198, 0.2)"
              animationDuration={0.65}
              pauseBetweenAnimations={1.2}
            />
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
            The next generation of high-performance tech is dropping soon.
            Discover a curated selection of advanced hardware designed for
            tomorrow.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl border-t border-border/60 flex flex-col sm:flex-row items-center justify-between py-8 gap-4 mt-12 text-xs text-muted-foreground">
        <div>
          <span>
            © {new Date().getFullYear()} FTC - Electronics. All rights reserved.
          </span>
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-foreground transition-colors">
            Privacy Policy
          </a>
          <a href="#" className="hover:text-foreground transition-colors">
            Terms of Service
          </a>
          <a href="#" className="hover:text-foreground transition-colors">
            Contact Support
          </a>
        </div>
      </footer>
    </div>
  );
}
