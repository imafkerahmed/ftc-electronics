"use client";

import { useEffect, useState } from "react";
import { useUiStore } from "@/store/use-ui-store";
import { motion } from "motion/react";

export default function HomePageLoaderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasIntroPlayed = useUiStore((state) => state.hasIntroPlayed);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
     
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="opacity-0">{children}</div>;
  }

  return (
    <motion.div
      initial={hasIntroPlayed ? { opacity: 1 } : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, ease: "easeOut", delay: 1.5 }}
    >
      {children}
    </motion.div>
  );
}
