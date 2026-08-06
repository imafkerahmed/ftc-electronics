"use client";

import { ReactLenis } from "lenis/react";
import { usePathname } from "next/navigation";

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminOrPos =
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/pos" ||
    pathname.startsWith("/pos/");

  if (isAdminOrPos) {
    return <>{children}</>;
  }

  return (
    <ReactLenis root options={{ lerp: 0.12, smoothWheel: true, touchMultiplier: 1.5 }}>
      {children}
    </ReactLenis>
  );
}
