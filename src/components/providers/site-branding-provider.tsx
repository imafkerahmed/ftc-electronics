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

const SiteBrandingContext = createContext<SiteBrandingContextType>(defaultBranding);

export function SiteBrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<SiteBrandingContextType>(defaultBranding);

  useEffect(() => {
    async function loadBranding() {
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

        setBranding({
          siteName,
          tagline,
          logoUrl,
          darkLogoUrl,
          faviconUrl,
          primaryColor,
          announcement,
          isLoading: false,
        });

        // Dynamically update browser tab favicon and title if custom favicon is set
        if (typeof window !== 'undefined') {
          if (faviconUrl) {
            const links = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']");
            if (links.length > 0) {
              links.forEach((l) => (l.href = faviconUrl));
            } else {
              const link = document.createElement('link');
              link.type = 'image/x-icon';
              link.rel = 'shortcut icon';
              link.href = faviconUrl;
              document.getElementsByTagName('head')[0].appendChild(link);
            }
          }
          if (siteName && siteName !== 'FTC Electronics') {
            document.title = `${siteName} | ${tagline}`;
          }
        }
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

export function useSiteBranding() {
  return useContext(SiteBrandingContext);
}
