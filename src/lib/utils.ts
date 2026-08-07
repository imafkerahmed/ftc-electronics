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
  return clean.startsWith('/') && !clean.startsWith('//') && !clean.startsWith('/\\') && !clean.includes('\\');
}

export function getSafeRedirectUrl(target: unknown, fallback: string = '/'): string {
  const raw = Array.isArray(target) ? target[0] : target;
  return isValidSafeRedirect(raw) ? raw.trim() : fallback;
}
