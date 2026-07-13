'use server';

import { cookies, headers } from 'next/headers';
import PocketBase from 'pocketbase';
import { writeAuditLog } from '@/lib/pb-admin';
import type { AdminRole } from '@/types/admin';

// ─── Rate Limiting (in-memory, per-server-instance) ──────────────────────────
// In production, use Redis or a distributed rate limiter.
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record) return { allowed: true };

  // Reset if lockout has expired
  if (now - record.lastAttempt > LOCKOUT_DURATION_MS) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }

  if (record.count >= MAX_ATTEMPTS) {
    const retryAfterMs = LOCKOUT_DURATION_MS - (now - record.lastAttempt);
    return { allowed: false, retryAfterMs };
  }

  return { allowed: true };
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record) {
    record.count += 1;
    record.lastAttempt = now;
  } else {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
  }
}

function clearAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

// ─── Login Action ─────────────────────────────────────────────────────────────

export interface LoginResult {
  success: boolean;
  error?: string;
  role?: AdminRole;
}

/**
 * Server action to log in an admin.
 * 
 * Flow:
 * 1. Rate limit check
 * 2. Authenticate via PocketBase users collection
 * 3. Verify the user has an admin role
 * 4. Set HTTP-Only, secure cookie with the JWT token
 * 5. Write audit log entry
 * 
 * The JWT token contains the user's role claim, which the proxy
 * reads to enforce route-level access control.
 */
export async function loginAction(formData: FormData): Promise<LoginResult> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { success: false, error: 'Please provide both email and password.' };
  }

  // Get client IP for rate limiting and audit logging
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() 
    || headersList.get('x-real-ip') 
    || 'unknown';
  const userAgent = headersList.get('user-agent') || 'unknown';

  // Rate limit check
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    const minutes = Math.ceil((rateCheck.retryAfterMs || 0) / 60000);
    return {
      success: false,
      error: `Too many failed attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
    };
  }

  const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
  if (!pbUrl) {
    return { success: false, error: 'Server configuration error.' };
  }

  const pb = new PocketBase(pbUrl);
  pb.autoCancellation(false);

  let success = false;
  let userRole: AdminRole = 'read_only';
  let errorMessage = 'Invalid credentials.';
  let userId = '';

  // Attempt 1: Authenticate via users collection
  try {
    const authData = await pb.collection('users').authWithPassword(email, password);
    const record = authData.record;
    userId = record.id;

    // Check if user has an admin role
    let role = record.role as string | undefined;
    
    // Map 'admin' role in DB to 'super_admin' in code
    if (role === 'admin') {
      role = 'super_admin';
    }

    const validAdminRoles: AdminRole[] = ['super_admin', 'store_manager', 'content_editor', 'support_staff', 'read_only'];

    if (role && validAdminRoles.includes(role as AdminRole)) {
      success = true;
      userRole = role as AdminRole;
    } else if (record.isAdmin === true || record.is_admin === true) {
      // Backwards compatibility: treat boolean admin flag as super_admin
      success = true;
      userRole = 'super_admin';
    } else {
      pb.authStore.clear();
      errorMessage = 'Access denied. You do not have administrator permissions.';
    }
  } catch (err: unknown) {
    const pbErr = err as { message?: string };
    errorMessage = pbErr.message || errorMessage;
  }


  if (success) {
    // Clear rate limit counter on successful login
    clearAttempts(ip);

    const cookieStore = await cookies();

    // Set HTTP-Only, secure cookie for the session token
    cookieStore.set('pb_auth_token', pb.authStore.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', // Upgraded from 'lax' for better CSRF protection
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    // Store the role in a separate cookie for proxy access
    // (The proxy can't decode JWT on every request efficiently,
    //  so we store the role separately. This is still validated server-side
    //  on every admin action.)
    cookieStore.set('pb_auth_role', userRole, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    // Write audit log (fire-and-forget)
    writeAuditLog(
      email,
      'login',
      'auth',
      userId,
      undefined,
      { role: userRole, ip },
      { ip, userAgent }
    );

    return { success: true, role: userRole };
  }

  // Record failed attempt for rate limiting
  recordFailedAttempt(ip);

  // Write failed login audit log (fire-and-forget)
  writeAuditLog(
    email,
    'login',
    'auth',
    undefined,
    undefined,
    { success: false, error: errorMessage, ip },
    { ip, userAgent }
  );

  return { success: false, error: errorMessage };
}

// ─── Logout Action ────────────────────────────────────────────────────────────

/**
 * Server action to log out.
 * Clears all auth cookies and writes audit log.
 */
export async function logoutAction(): Promise<{ success: boolean }> {
  const cookieStore = await cookies();
  const headersList = await headers();

  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  // Try to get the email from the token for audit logging
  let actorEmail = 'unknown';
  const token = cookieStore.get('pb_auth_token')?.value;
  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded = atob(base64);
        const payload = JSON.parse(decoded);
        actorEmail = payload.email || payload.sub || 'unknown';
      }
    } catch {
      // Can't decode token, proceed with logout anyway
    }
  }

  // Clear auth cookies
  cookieStore.delete('pb_auth_token');
  cookieStore.delete('pb_auth_role');

  // Write audit log (fire-and-forget)
  writeAuditLog(actorEmail, 'logout', 'auth', undefined, undefined, { ip }, { ip });

  return { success: true };
}
