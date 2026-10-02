'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { sbSiteSettings } from '@/lib/supabase-collections';

export interface SiteBrandingContextType {
  siteName: string;
  tagline: string;
  logoUrl: string;
  darkLogoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  storeHours: string;
  storeHoursList: Array<{ days: string; time: string }>;
  contactInfo: {
    phone: string;
    email: string;
    whatsapp: string;
  };
  location: {
    address: string;
    city: string;
    googleMapsUrl: string;
  };
  announcement: {
    show: boolean;
    bgColor: string;
    texts: {
      id: string;
      text: string;
      link?: string;
      enabled: boolean;
    }[];
  };
  digitalCardEnabled: boolean;
  bankDetails: {
    bankName: string;
    accountName: string;
    accountNo: string;
    branch: string;
    branchCode: string;
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
  storeHours: '9:00 AM - 7:00 PM Daily',
  storeHoursList: [
    { days: 'Monday – Saturday', time: '9:00 AM – 7:00 PM' },
    { days: 'Sunday', time: '10:00 AM – 5:00 PM' },
  ],
  contactInfo: {
    phone: '+94 76 666 4566',
    email: 'info@ftc.lk',
    whatsapp: '+94 76 666 4566',
  },
  location: {
    address: 'No. 91/2/4, First Cross Street',
    city: 'Colombo 11',
    googleMapsUrl: '',
  },
  announcement: {
    show: true,
    bgColor: '#1e293b',
    texts: []
  },
  digitalCardEnabled: true,
  bankDetails: {
    bankName: '',
    accountName: '',
    accountNo: '',
    branch: '',
    branchCode: '',
  },
  isLoading: true,
};

const CACHE_KEY = 'ftc_site_branding_v3';
const CACHE_TTL_MS = 5 * 60 * 1000;

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
    // skip
  }
}

const SiteBrandingContext = createContext<SiteBrandingContextType>(defaultBranding);

export function SiteBrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<SiteBrandingContextType>(defaultBranding);

  useEffect(() => {
    async function loadBranding() {
      const cached = readBrandingCache();
      if (cached) {
        setBranding({ ...cached, isLoading: false });
        applyBrandingToDOM(cached);
        return;
      }

      try {
        const response = await fetch('/api/settings/branding');
        if (!response.ok) throw new Error('Failed to fetch branding');
        
        const data = await response.json();
        const genSettings = data.general;
        const persSettings = data.personalization;

        const siteName = genSettings?.siteName || defaultBranding.siteName;
        const tagline = genSettings?.tagline || defaultBranding.tagline;
        const storeHours = genSettings?.storeHoursCopy || defaultBranding.storeHours;
        const rawStoreHoursList = genSettings?.storeHoursList || genSettings?.weeklyHours;
        const storeHoursList: Array<{ days: string; time: string }> = Array.isArray(rawStoreHoursList) && rawStoreHoursList.length > 0
          ? rawStoreHoursList.map((item: any) => ({
              days: item.days || item.day || 'Days',
              time: item.isOpen === false ? 'Closed' : item.time || 'Closed',
            }))
          : defaultBranding.storeHoursList;

        const contactInfo = {
          phone: genSettings?.contactInfo?.phone || defaultBranding.contactInfo.phone,
          email: genSettings?.contactInfo?.email || defaultBranding.contactInfo.email,
          whatsapp: genSettings?.contactInfo?.whatsapp || defaultBranding.contactInfo.whatsapp,
        };
        const location = {
          address: genSettings?.location?.address || defaultBranding.location.address,
          city: genSettings?.location?.city || defaultBranding.location.city,
          googleMapsUrl: genSettings?.location?.googleMapsUrl || defaultBranding.location.googleMapsUrl,
        };

        const logoUrl = persSettings?.logoUrl || '/loader-logo.webp';
        const darkLogoUrl = persSettings?.darkLogoUrl || '';
        const faviconUrl = persSettings?.faviconUrl || '';
        const primaryColor = persSettings?.primaryColor || defaultBranding.primaryColor;
        const announcement = persSettings?.announcement || defaultBranding.announcement;
        const digitalCardEnabled = genSettings?.digitalCardEnabled !== false;
        
        const bankDetails = {
          bankName: genSettings?.bankDetails?.bankName || '',
          accountName: genSettings?.bankDetails?.accountName || '',
          accountNo: genSettings?.bankDetails?.accountNo || '',
          branch: genSettings?.bankDetails?.branch || '',
          branchCode: genSettings?.bankDetails?.branchCode || '',
        };

        const fresh: SiteBrandingContextType = {
          siteName,
          tagline,
          logoUrl,
          darkLogoUrl,
          faviconUrl,
          primaryColor,
          storeHours,
          storeHoursList,
          contactInfo,
          location,
          announcement,
          digitalCardEnabled,
          bankDetails,
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
