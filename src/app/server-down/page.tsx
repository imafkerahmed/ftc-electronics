"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import Link from "next/link";

export default function ServerDownPage() {
  const router = useRouter();
  const [retrying, setRetrying] = React.useState(false);
  const [dots, setDots] = React.useState(".");
  const [autoRetryIn, setAutoRetryIn] = React.useState(30);

  // Animated ellipsis
  React.useEffect(() => {
    const iv = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "." : d + "."));
    }, 500);
    return () => clearInterval(iv);
  }, []);

  // Auto-retry countdown
  React.useEffect(() => {
    if (autoRetryIn <= 0) {
      handleRetry();
      return;
    }
    const t = setTimeout(() => setAutoRetryIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [autoRetryIn]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) {
        router.push("/");
        return;
      }
    } catch {
      // still down
    }
    setRetrying(false);
    setAutoRetryIn(30);
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-between overflow-hidden bg-[#0a0a0b] text-white font-sans px-4 py-8 sm:px-6">
      {/* Background grid */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(120,119,198,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(120,119,198,0.06) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      {/* Top gradient glow */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(120,119,198,0.18),transparent)]" />
      {/* Red glow behind icon */}
      <div className="absolute top-[22%] left-1/2 -translate-x-1/2 -z-10 w-64 h-64 rounded-full bg-red-500/10 blur-[80px]" />

      {/* Header */}
      <header className="w-full max-w-6xl flex items-center justify-between py-5">
        <Link href="/" className="flex items-center gap-0">
          <span className="font-bold tracking-tight text-base sm:text-lg text-white">
            FTC{" "}
            <span className="font-normal text-white/40">/ ELECTRONICS</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-medium">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          Investigating
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-col items-center justify-center text-center flex-1 gap-8 max-w-xl py-16">
        {/* Icon */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-red-500/20 blur-2xl scale-150" />
          <div className="relative flex items-center justify-center w-24 h-24 rounded-2xl bg-white/5 border border-white/10 shadow-xl">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-11 h-11 text-red-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-label="Server disconnected icon"
            >
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="4" y1="4" x2="20" y2="20" className="text-red-500" stroke="#ef4444" />
            </svg>
          </div>
        </div>

        {/* Text */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold tracking-widest text-white/40 uppercase bg-white/5 border border-white/10">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Service Disruption
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Service Temporarily{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">
              Unavailable
            </span>
          </h1>

          <p className="text-white/50 text-base sm:text-lg leading-relaxed max-w-md mx-auto">
            Our backend service is currently unreachable. This is likely a
            temporary network issue and we&apos;re already working on it.
          </p>
        </div>

        {/* Status cards */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-sm text-center">
          {[
            { label: "Database", status: "Degraded", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
            { label: "API", status: "Degraded", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
            { label: "CDN", status: "Operational", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
          ].map((s) => (
            <div
              key={s.label}
              className={`flex flex-col gap-1.5 rounded-xl border p-3 ${s.bg}`}
            >
              <span className="text-white/60 text-[11px] font-medium">{s.label}</span>
              <span className={`text-xs font-semibold ${s.color}`}>{s.status}</span>
            </div>
          ))}
        </div>

        {/* Retry button */}
        <div className="flex flex-col items-center gap-3">
          <button
            id="server-down-retry-btn"
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {retrying ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Checking{dots}
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Try Again
              </>
            )}
          </button>
          {!retrying && (
            <p className="text-white/25 text-xs">
              Auto-retrying in {autoRetryIn}s
            </p>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-6xl border-t border-white/5 flex flex-col sm:flex-row items-center justify-between py-6 gap-4 text-xs text-white/25">
        <span>© {new Date().getFullYear()} FTC Electronics. All rights reserved.</span>
        <div className="flex items-center gap-5">
          <a href="mailto:support@ftcelectronics.lk" className="hover:text-white/50 transition-colors">
            Contact Support
          </a>
          <a href="/legal/privacy-policy" className="hover:text-white/50 transition-colors">
            Privacy Policy
          </a>
        </div>
      </footer>
    </div>
  );
}
