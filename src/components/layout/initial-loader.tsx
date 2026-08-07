"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";
import { useSiteBranding } from "@/components/providers/site-branding-provider";
import { useUiStore } from "@/store/use-ui-store";

export default function InitialLoader() {
  const { logoUrl, siteName, isLoading: isBrandingLoading } = useSiteBranding();
  const hasIntroPlayed = useUiStore((state) => state.hasIntroPlayed);
  const setIntroPlayed = useUiStore((state) => state.setIntroPlayed);

  const [isVisible, setIsVisible] = useState(true);
  const [minTimerDone, setMinTimerDone] = useState(false);
  const [windowLoaded, setWindowLoaded] = useState(false);

  // 1. Minimum display timer (~1000ms) to ensure smooth branding appearance
  useEffect(() => {
    const sessionPlayed =
      typeof window !== "undefined" &&
      sessionStorage.getItem("ftc_intro_played") === "1";
    if (sessionPlayed || hasIntroPlayed) {
      setIsVisible(false);
      return;
    }

    document.body.style.overflow = "hidden";

    const timer = setTimeout(() => {
      setMinTimerDone(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [hasIntroPlayed]);

  // 2. Track full window/DOM component loading
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (document.readyState === "complete") {
      setWindowLoaded(true);
    } else {
      const handleLoad = () => setWindowLoaded(true);
      window.addEventListener("load", handleLoad);
      return () => window.removeEventListener("load", handleLoad);
    }
  }, []);

  // 3. Hide loader only when branding is ready, page components loaded, and min timer passed
  useEffect(() => {
    if (!isVisible) return;

    if (minTimerDone && windowLoaded && !isBrandingLoading) {
      setIsVisible(false);
      setIntroPlayed(true);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("ftc_intro_played", "1");
      }
      document.body.style.overflow = "";
    }
  }, [
    minTimerDone,
    windowLoaded,
    isBrandingLoading,
    isVisible,
    setIntroPlayed,
  ]);

  // Cleanup body overflow if unmounted
  useEffect(() => {
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background select-none pointer-events-auto p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 85, damping: 20 }}
            className="flex items-center justify-center"
          >
            {logoUrl && (
              <Image
                src={logoUrl}
                alt={siteName || "FTC Electronics"}
                width={480}
                height={160}
                priority
                unoptimized={
                  !logoUrl.startsWith("http") && !logoUrl.startsWith("/")
                }
                className="h-28 sm:h-44 lg:h-56 max-h-64 w-auto max-w-[85vw] object-contain drop-shadow-2xl"
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
