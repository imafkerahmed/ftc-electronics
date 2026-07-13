import PocketBase from 'pocketbase';

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;

if (!pbUrl) {
  throw new Error('NEXT_PUBLIC_POCKETBASE_URL is not set in the environment variables.');
}

/**
 * Reusable PocketBase Client Instance.
 * - On the client-side, this automatically uses localStorage to persist the auth session.
 * - On the server-side, you can configure it with headers/cookies.
 */
export const pb = new PocketBase(pbUrl);
pb.autoCancellation(false);

// Optional: Helper to check if a user is currently logged in
export function isUserAuthenticated(): boolean {
  return pb.authStore.isValid;
}

// Optional: Helper to get current authenticated user data
export function getCurrentUser() {
  return pb.authStore.model;
}
