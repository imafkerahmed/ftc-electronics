"use client";

import React, { useEffect, useRef, useState } from "react";

interface LazyScrollSectionProps {
  children: React.ReactNode;
  heightClass?: string;
  className?: string;
}

export default function LazyScrollSection({
  children,
  heightClass = "min-h-[300px]",
  className = ""
}: LazyScrollSectionProps): React.JSX.Element {
  const [isMounted, setIsMounted] = useState(false);
  const [hasIntersected, setHasIntersected] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsMounted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!isMounted || hasIntersected) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setHasIntersected(true);
        }
      },
      {
        rootMargin: "400px 0px", // Preload section 400px before entering viewport for smooth transition
        threshold: 0.01,
      }
    );

    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [isMounted, hasIntersected]);

  // Keep it SSR-friendly and hydration-safe by rendering children initially on server and hydration
  if (!isMounted) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      ref={ref}
      className={`${hasIntersected ? "" : heightClass} ${className}`}
    >
      {hasIntersected ? (
        children
      ) : (
        <div className="w-full h-full" />
      )}
    </div>
  );
}
