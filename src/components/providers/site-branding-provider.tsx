'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { pbSiteSettings } from '@/lib/pb-collections';

export interface SiteBrandingContextType {
  siteName: string;
  tagline: string;
  logoUrl: string;
  darkLogoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  announcement: {
    show: boolean;
    text: string;
    link: string;
    bgColor: string;
  };
  isLoading: boolean;
}

const defaultBranding: SiteBrandingContextType = {
  siteName: 'FTC Electronics',
  tagline: 'Premium Electronics Store & Authorized Reseller',
  logoUrl: '',
  darkLogoUrl: '',
  faviconUrl: '',
  primaryColor: '#2563eb',
  announcement: {
    show: true,
    text: '🚀 Free islandwide delivery on orders over LKR 50,000 | Authorized Reseller',
    link: '/products',
    bgColor: '#1e293b',
  },
  isLoading: true,
};

const CACHE_KEY = 'ftc_site_branding';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function readBrandingCache(): SiteBrandingContextType | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: SiteBrandingContextType; ts: number };
    if (Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function writeBrandingCache(data: SiteBrandingContextType) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // sessionStorage quota exceeded or unavailable — silently skip
  }
}

const SiteBrandingContext = createContext<SiteBrandingContextType>(defaultBranding);

export function SiteBrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<SiteBrandingContextType>(defaultBranding);

  useEffect(() => {
    async function loadBranding() {
      // 1. Try cache first — instant load on subsequent page views
      const cached = readBrandingCache();
      if (cached) {
        setBranding({ ...cached, isLoading: false });
        applyBrandingToDOM(cached);
        return;
      }

      // 2. Cache miss — fetch from PocketBase
      try {
        const [genSettings, persSettings] = await Promise.all([
          pbSiteSettings.get<any>('general').catch(() => null),
          pbSiteSettings.get<any>('personalization').catch(() => null),
        ]);

        const siteName = genSettings?.siteName || defaultBranding.siteName;
        const tagline = genSettings?.tagline || defaultBranding.tagline;
        const logoUrl = persSettings?.logoUrl || '';
        const darkLogoUrl = persSettings?.darkLogoUrl || '';
        const faviconUrl = persSettings?.faviconUrl || '';
        const primaryColor = persSettings?.primaryColor || defaultBranding.primaryColor;
        const announcement = persSettings?.announcement || defaultBranding.announcement;

        const fresh: SiteBrandingContextType = {
          siteName,
          tagline,
          logoUrl,
          darkLogoUrl,
          faviconUrl,
          primaryColor,
          announcement,
          isLoading: false,
        };

        setBranding(fresh);
        writeBrandingCache(fresh);
        applyBrandingToDOM(fresh);
      } catch (err) {
        console.warn('Failed to load site branding settings:', err);
        setBranding((prev) => ({ ...prev, isLoading: false }));
      }
    }

    void loadBranding();
  }, []);

  return (
    <SiteBrandingContext.Provider value={branding}>
      {children}
    </SiteBrandingContext.Provider>
  );
}

function applyBrandingToDOM(branding: SiteBrandingContextType) {
  if (typeof window === 'undefined') return;
  const { faviconUrl, siteName, tagline } = branding;
  if (faviconUrl) {
    const links = document.querySelectorAll<HTMLLinkElement>(
      "link[rel='icon'], link[rel='shortcut icon']"
    );
    if (links.length > 0) {
      links.forEach((l) => (l.href = faviconUrl));
    } else {
      const link = document.createElement('link');
      link.type = 'image/x-icon';
      link.rel = 'icon';
      link.href = faviconUrl;
      document.getElementsByTagName('head')[0].appendChild(link);
    }
  }
  if (siteName && siteName !== 'FTC Electronics') {
    document.title = `${siteName} | ${tagline}`;
  }
}

export function useSiteBranding() {
  return useContext(SiteBrandingContext);
}
