import PocketBase, { BaseAuthStore } from 'pocketbase';

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;

if (!pbUrl) {
  throw new Error('NEXT_PUBLIC_POCKETBASE_URL is not set in the environment variables.');
}

/**
 * Reusable OWASP-Compliant PocketBase Client Instance.
 * - Enforces in-memory AuthStore (BaseAuthStore) on the client side.
 * - Prevents sensitive auth tokens from being saved to localStorage (protecting against XSS token theft).
 * - Automatically purges legacy localStorage tokens on client initialization.
 */
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('pocketbase_auth');
  } catch {
    // Ignore storage access errors
  }
}

export const pb = new PocketBase(pbUrl, new BaseAuthStore());
pb.autoCancellation(false);

// Optional: Helper to check if a user is currently logged in
export function isUserAuthenticated(): boolean {
  return pb.authStore.isValid;
}

// Optional: Helper to get current authenticated user data
export function getCurrentUser() {
  return pb.authStore.model;
}
