"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "motion/react";

export default function InitialLoader() {
  const [isVisible, setIsVisible] = useState(true);
  const [minTimerDone, setMinTimerDone] = useState(false);
  const [windowLoaded, setWindowLoaded] = useState(false);

  // Lock body scroll while loader is active
  useEffect(() => {
    document.body.style.overflow = "hidden";

    // 1.8 second minimum display duration for high visibility on every refresh
    const timer = setTimeout(() => {
      setMinTimerDone(true);
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  // Track window DOM & component loading
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

  // Hide loader once minimum duration has elapsed and window components are loaded
  useEffect(() => {
    if (minTimerDone && windowLoaded) {
      setIsVisible(false);
      document.body.style.overflow = "";
    }
  }, [minTimerDone, windowLoaded]);

  // Cleanup body overflow on unmount
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
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background select-none pointer-events-auto p-4 border-none outline-none"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex items-center justify-center border-none outline-none"
          >
            <Image
              src="/loader-logo.webp"
              alt="FTC Electronics"
              width={480}
              height={160}
              priority
              className="h-28 sm:h-44 lg:h-56 max-h-64 w-auto max-w-[85vw] object-contain border-none outline-none shadow-none ring-0"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
