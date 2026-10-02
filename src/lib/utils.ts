import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(amount: number, currency: 'USD' | 'LKR' = 'LKR') {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);
  return `${currency} ${formatted}`;
}

export function isValidSafeRedirect(target: unknown): target is string {
  if (typeof target !== 'string' || !target.trim()) return false;
  const clean = target.trim();
  if (!clean.startsWith('/') || clean.startsWith('//') || clean.startsWith('/\\') || clean.includes('\\')) {
    return false;
  }
  // Disallow control characters and javascript/data pseudo-protocols
  if (/[\x00-\x1F\x7F\r\n\t]/.test(clean)) return false;
  try {
    const parsed = new URL(clean, 'http://localhost');
    return parsed.origin === 'http://localhost' && parsed.pathname.startsWith('/') && !parsed.pathname.startsWith('//');
  } catch {
    return false;
  }
}

export function getSafeRedirectUrl(target: unknown, fallback: string = '/'): string {
  const raw = Array.isArray(target) ? target[0] : target;
  return isValidSafeRedirect(raw) ? raw.trim() : fallback;
}

/** Returns a fully-qualified safe image URL or null if unavailable. */
export function getProductThumbnail(images: (string | undefined | null)[] | string | undefined | null): string | null {
  if (!images) return null;
  const list = Array.isArray(images) ? images : [images];
  for (const src of list) {
    if (!src || typeof src !== 'string' || !src.trim()) continue;
    const trimmed = src.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.includes('\\')) continue;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^data:image\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;

    // Handle Supabase storage relative keys
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    if (supabaseUrl) {
      const encodedPath = trimmed.split('/').map(encodeURIComponent).join('/');
      return `${supabaseUrl}/storage/v1/object/public/ftc-media/${encodedPath}`;
    }
  }
  return null;
}
