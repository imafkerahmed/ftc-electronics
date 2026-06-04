import * as React from "react";

// Custom SVG Social Icons
const TwitterIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const InstagramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const LinkedinIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

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
            FTC <span className="font-normal text-muted-foreground">/ ELECTRONICS</span>
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-2xl flex flex-col items-center justify-center text-center flex-1 py-12 sm:py-16 md:py-24 gap-8 sm:gap-12">
        
        {/* Hero Headline & Subtitle */}
        <div className="space-y-4 max-w-2xl">
          <div className="inline-block rounded-lg px-3 py-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase bg-secondary/50 border border-border">
            The Tech Revolution Begins
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight bg-gradient-to-b from-foreground to-foreground/80 bg-clip-text text-transparent leading-[1.1] pb-1">
            FTC - Electronics
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed">
            The next generation of high-performance tech is dropping soon. Discover a curated selection of advanced hardware designed for tomorrow.
          </p>
        </div>


      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl border-t border-border/60 flex flex-col sm:flex-row items-center justify-between py-8 gap-4 mt-12 text-xs text-muted-foreground">
        <div>
          <span>© {new Date().getFullYear()} FTC - Electronics. All rights reserved.</span>
        </div>
        
        {/* Footer Navigation */}
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-foreground transition-colors">Terms of Service</a>
          <a href="#" className="hover:text-foreground transition-colors">Contact Support</a>
        </div>
        
        {/* Social media icons */}
        <div className="flex items-center gap-4">
          <a href="#" aria-label="Twitter" className="p-1 hover:text-foreground hover:scale-105 transition-all">
            <TwitterIcon className="w-4 h-4" />
          </a>
          <a href="#" aria-label="GitHub" className="p-1 hover:text-foreground hover:scale-105 transition-all">
            <GithubIcon className="w-4 h-4" />
          </a>
          <a href="#" aria-label="Instagram" className="p-1 hover:text-foreground hover:scale-105 transition-all">
            <InstagramIcon className="w-4 h-4" />
          </a>
          <a href="#" aria-label="LinkedIn" className="p-1 hover:text-foreground hover:scale-105 transition-all">
            <LinkedinIcon className="w-4 h-4" />
          </a>
        </div>
      </footer>
    </div>
  );
}
