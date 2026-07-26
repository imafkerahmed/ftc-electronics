'use client';

import Link from 'next/link';
import { useSiteBranding } from '@/components/providers/site-branding-provider';

interface StoreLogoHeaderProps {
  className?: string;
  /** When true, the logo is not wrapped in a navigation Link (e.g. inside modals) */
  noLink?: boolean;
}

export function StoreLogoHeader({ className = '', noLink = false }: StoreLogoHeaderProps) {
  const { logoUrl, darkLogoUrl, siteName, isLoading } = useSiteBranding();

  // Use the light or dark logo (prefer dark logo if available since modals can be light or dark)
  const activeLogo = logoUrl || darkLogoUrl;

  const logoContent = isLoading ? (
    // Skeleton while branding loads — matches the logo height so layout doesn't shift
    <div className="h-16 w-40 mx-auto rounded-md bg-muted/60 animate-pulse" aria-hidden="true" />
  ) : activeLogo ? (
    <img
      src={activeLogo}
      alt={siteName || 'Store Logo'}
      className="h-16 w-auto max-h-20 object-contain mx-auto"
    />
  ) : (
    // Text fallback — only shown if no logo is uploaded in personalization settings
    <div className="flex items-center justify-center gap-2 text-2xl font-bold tracking-wider text-foreground">
      <span className="bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent font-extrabold">
        FTC
      </span>
      <span className="text-muted-foreground font-light">|</span>
      <span className="text-xs uppercase tracking-widest text-foreground/90 font-semibold">
        {siteName && siteName !== 'FTC Electronics' ? siteName : 'Electronics'}
      </span>
    </div>
  );

  if (noLink) {
    return <div className={className}>{logoContent}</div>;
  }

  return (
    <Link href="/" className={`inline-block group hover:opacity-90 transition-opacity ${className}`}>
      {logoContent}
    </Link>
  );
}
