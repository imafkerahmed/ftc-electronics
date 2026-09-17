import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { LenisProvider } from "@/components/layout/lenis-provider";
import { SiteBrandingProvider } from "@/components/providers/site-branding-provider";
import { FramerMotionConfigProvider } from "@/components/providers/framer-motion-config-provider";
import { QueryProvider } from "@/components/providers/query-provider";

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: 'swap',
});

// Mono font is non-critical — use 'optional' so it never blocks render
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: 'optional',
});

export const metadata: Metadata = {
  title: "FTC Electronics | Premium Electronics & Authorized Reseller",
  description: "Official online store for FTC Electronics.",
};

import { AuthListener } from "@/components/auth/auth-listener";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable)}
    >
      <head>

      </head>
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <SiteBrandingProvider>
            <FramerMotionConfigProvider>
              <LenisProvider>
                <AuthListener />
                {children}
              </LenisProvider>
            </FramerMotionConfigProvider>
          </SiteBrandingProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

