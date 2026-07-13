/**
 * Server-side PocketBase admin client.
 * 
 * This module provides an authenticated PocketBase instance for use in
 * server actions and API routes. It authenticates as a superuser so 
 * admin operations (CRUD on all collections) are authorized.
 * 
 * IMPORTANT: Only import this in server-side code (server actions, 
 * API routes, server components). Never import in client components.
 */

import PocketBase from 'pocketbase';
import type { AuditAction } from '@/types/admin';

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const superuserEmail = process.env.POCKETBASE_SUPERUSER_EMAIL;
const superuserPassword = process.env.POCKETBASE_SUPERUSER_PASSWORD;

if (!pbUrl) {
  throw new Error('[pb-admin] NEXT_PUBLIC_POCKETBASE_URL is not set.');
}

// Singleton admin client — we authenticate once and reuse the token.
// PocketBase JS SDK auto-refreshes when the token nears expiry.
let adminPb: PocketBase | null = null;
let authPromise: Promise<PocketBase> | null = null;

/**
 * Returns an authenticated PocketBase instance for admin operations.
 * Uses superuser credentials from environment variables.
 * Thread-safe: concurrent calls reuse the same auth promise.
 */
export async function getAdminPb(): Promise<PocketBase> {
  // Return existing valid client
  if (adminPb && adminPb.authStore.isValid) {
    return adminPb;
  }

  // If auth is already in progress, wait for it
  if (authPromise) {
    return authPromise;
  }

  // Start new auth
  authPromise = authenticateAdmin();
  
  try {
    const pb = await authPromise;
    adminPb = pb;
    return pb;
  } finally {
    authPromise = null;
  }
}

async function authenticateAdmin(): Promise<PocketBase> {
  const pb = new PocketBase(pbUrl);

  // Disable auto-cancellation for server-side usage
  pb.autoCancellation(false);

  if (!superuserEmail || !superuserPassword) {
    console.warn(
      '[pb-admin] Superuser credentials not configured. ' +
      'Set POCKETBASE_SUPERUSER_EMAIL and POCKETBASE_SUPERUSER_PASSWORD in .env.local. ' +
      'Returning unauthenticated client.'
    );
    return pb;
  }

  try {
    // PocketBase 0.27+ uses collection-based auth for superusers
    // The _superusers collection is the system collection for admin accounts
    await pb.collection('_superusers').authWithPassword(superuserEmail, superuserPassword);
  } catch (err: unknown) {
    // Fallback: try the legacy admins endpoint (PocketBase <0.21)
    try {
      await (pb as unknown as { admins: { authWithPassword: (e: string, p: string) => Promise<unknown> } })
        .admins.authWithPassword(superuserEmail, superuserPassword);
    } catch {
      console.error('[pb-admin] Failed to authenticate as superuser:', err);
      // Return unauthenticated — callers will get permission errors on protected operations
    }
  }

  return pb;
}

/**
 * Writes an entry to the audit_log collection.
 * This is fire-and-forget — it won't block the calling operation.
 * 
 * @param actor - Email or user ID of the person performing the action
 * @param action - The type of action (create/update/delete/login/etc.)
 * @param collection - Which collection was affected
 * @param recordId - The ID of the affected record (optional for login/logout)
 * @param oldValue - Previous state of the record (for updates)
 * @param newValue - New state of the record (for creates/updates)
 * @param meta - Additional context (IP address, user agent)
 */
export async function writeAuditLog(
  actor: string,
  action: AuditAction,
  collection: string,
  recordId?: string,
  oldValue?: Record<string, unknown>,
  newValue?: Record<string, unknown>,
  meta?: { ip?: string; userAgent?: string }
): Promise<void> {
  try {
    const pb = await getAdminPb();
    await pb.collection('audit_log').create({
      actor,
      action,
      collection,
      recordId: recordId || '',
      oldValue: oldValue ? JSON.stringify(oldValue) : '',
      newValue: newValue ? JSON.stringify(newValue) : '',
      ip: meta?.ip || '',
      userAgent: meta?.userAgent || '',
    });
  } catch (err) {
    // Audit logging should never break the main operation (e.g. login).
    // Log the error as a warning but don't throw.
    console.warn('[pb-admin] Warning: Failed to write audit log (the audit_log collection might not exist yet):', (err as Error).message);
  }
}

/**
 * Get the PocketBase URL for constructing file URLs.
 * Used by converter functions in types/admin.ts.
 */
export function getPbUrl(): string {
  return pbUrl || '';
}

/**
 * Checks if the PocketBase instance is reachable.
 * Useful for health checks and connection validation.
 */
export async function checkPbHealth(): Promise<boolean> {
  try {
    const pb = new PocketBase(pbUrl);
    pb.autoCancellation(false);
    const health = await pb.health.check();
    return health.code === 200;
  } catch {
    return false;
  }
}
