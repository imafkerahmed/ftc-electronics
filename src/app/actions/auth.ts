'use server';

import { cookies, headers } from 'next/headers';
import crypto from 'crypto';
import PocketBase from 'pocketbase';
import { getAdminPb, writeAuditLog } from '@/lib/pb-admin';
import { getTrustedClientIp } from '@/lib/get-client-ip';
import type { AdminRole } from '@/types/admin';

function scryptAsync(password: string, salt: string, keylen: number, options: crypto.ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

// ─── Rate Limiting & Protection ──────────────────────────────────────────────
// In-memory sliding-window rate limiter per IP & action.

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

const ACTION_RATE_LIMITS: Record<string, RateLimitConfig> = {
  login: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },          // 5 attempts per 15 mins
  signup: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },         // 5 attempts per 15 mins
  forgotPassword: { maxAttempts: 3, windowMs: 15 * 60 * 1000 }, // 3 attempts per 15 mins
  resetPassword: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },  // 5 attempts per 15 mins
};

const rateLimitStore = new Map<string, { count: number; lastAttempt: number }>();

function cleanupExpiredRateLimits(): void {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    const action = key.split(':')[1] || 'login';
    const config = ACTION_RATE_LIMITS[action] || { windowMs: 15 * 60 * 1000 };
    if (now - record.lastAttempt > config.windowMs) {
      rateLimitStore.delete(key);
    }
  }

  // Evict oldest entries if map exceeds safety limit
  if (rateLimitStore.size > 5000) {
    const oldestKeys = Array.from(rateLimitStore.keys()).slice(0, 1000);
    for (const k of oldestKeys) {
      rateLimitStore.delete(k);
    }
  }
}

function checkAuthRateLimit(ip: string, action: string): { allowed: boolean; retryAfterMs?: number } {
  cleanupExpiredRateLimits();
  const config = ACTION_RATE_LIMITS[action] || { maxAttempts: 5, windowMs: 15 * 60 * 1000 };
  const key = `${ip}:${action}`;
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record) return { allowed: true };

  if (now - record.lastAttempt > config.windowMs) {
    rateLimitStore.delete(key);
    return { allowed: true };
  }

  if (record.count >= config.maxAttempts) {
    const retryAfterMs = config.windowMs - (now - record.lastAttempt);
    return { allowed: false, retryAfterMs };
  }

  return { allowed: true };
}

function recordAuthAttempt(ip: string, action: string): void {
  cleanupExpiredRateLimits();
  const key = `${ip}:${action}`;
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (record) {
    record.count += 1;
    record.lastAttempt = now;
  } else {
    rateLimitStore.set(key, { count: 1, lastAttempt: now });
  }
}

function clearAuthAttempts(ip: string, action: string): void {
  const key = `${ip}:${action}`;
  rateLimitStore.delete(key);
}

// ─── OWASP Timing Equalization KDF Helper ────────────────────────────────────

/**
 * Asynchronously executes a dummy KDF operation off the main thread (using libuv threadpool)
 * to equalize execution time when an account does not exist or auth fails,
 * neutralizing timing side-channel attacks for user enumeration prevention
 * without blocking the Node.js main event loop thread.
 */
async function executeDummyKdf(): Promise<void> {
  try {
    await scryptAsync('dummy_password_timing_equalizer', 'owasp_static_salt_constant', 64, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 32 * 1024 * 1024,
    });
  } catch {
    // Ignore timing dummy errors
  }
}

// ─── Secure Reset Token Lifecycle Store ────────────────────────────────────────

interface ResetTokenRecord {
  id?: string;
  email: string;
  tokenHash: string;
  expiresAt: number;
  used: boolean;
}

const memoryTokenStore = new Map<string, ResetTokenRecord>();

function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [hash, rec] of memoryTokenStore.entries()) {
    if (rec.expiresAt < now || rec.used) {
      memoryTokenStore.delete(hash);
    }
  }

  if (memoryTokenStore.size > 2000) {
    const oldestKeys = Array.from(memoryTokenStore.keys()).slice(0, 500);
    for (const k of oldestKeys) {
      memoryTokenStore.delete(k);
    }
  }
}

async function saveResetTokenRecord(record: ResetTokenRecord): Promise<void> {
  cleanupExpiredTokens();
  const hashKey = record.tokenHash;
  memoryTokenStore.set(hashKey, record);

  try {
    const pb = await getAdminPb();
    const created = await pb.collection('password_reset_tokens').create({
      email: record.email,
      token_hash: record.tokenHash,
      expires_at: record.expiresAt,
      used: record.used,
    });
    record.id = created.id;
    memoryTokenStore.set(hashKey, record);
  } catch {
    // Fallback to memory store if collection is not provisioned in DB
  }
}

async function findResetTokenRecord(tokenHash: string): Promise<ResetTokenRecord | null> {
  cleanupExpiredTokens();
  const memoryRecord = memoryTokenStore.get(tokenHash);
  if (memoryRecord && memoryRecord.expiresAt >= Date.now()) {
    return memoryRecord;
  }

  try {
    const pb = await getAdminPb();
    const record = await pb.collection('password_reset_tokens').getFirstListItem(
      pb.filter('token_hash = {:tokenHash}', { tokenHash })
    );
    if (record) {
      const result: ResetTokenRecord = {
        id: record.id,
        email: record.email as string,
        tokenHash: record.token_hash as string,
        expiresAt: Number(record.expires_at),
        used: Boolean(record.used),
      };
      memoryTokenStore.set(tokenHash, result);
      return result;
    }
  } catch {
    // Fallback
  }

  return null;
}

async function markTokenUsed(tokenHash: string, record: ResetTokenRecord): Promise<void> {
  record.used = true;
  memoryTokenStore.set(tokenHash, record);

  try {
    const pb = await getAdminPb();
    let targetId = record.id;
    if (!targetId) {
      const dbRec = await pb.collection('password_reset_tokens').getFirstListItem(
        pb.filter('token_hash = {:tokenHash}', { tokenHash })
      );
      if (dbRec) targetId = dbRec.id;
    }
    if (targetId) {
      await pb.collection('password_reset_tokens').update(targetId, { used: true });
      record.id = targetId;
    }
  } catch {
    // Fallback
  }
}

async function revokeUserTokens(email: string): Promise<void> {
  for (const [hash, rec] of memoryTokenStore.entries()) {
    if (rec.email.toLowerCase() === email.toLowerCase()) {
      rec.used = true;
      memoryTokenStore.set(hash, rec);
    }
  }

  try {
    const pb = await getAdminPb();
    const records = await pb.collection('password_reset_tokens').getFullList({
      filter: pb.filter('email = {:email} && used = false', { email }),
    });
    for (const rec of records) {
      await pb.collection('password_reset_tokens').update(rec.id, { used: true });
    }
  } catch {
    // Fallback if collection is not provisioned or DB fails
  }
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface AuthActionResult {
  success: boolean;
  error?: string;
  message?: string;
  role?: AdminRole;
}

// ─── Login Action ─────────────────────────────────────────────────────────────

/**
 * Server action to log in a user/admin.
 * Follows OWASP Anti-User-Enumeration and Rate Limiting standards.
 */
export async function loginAction(formData: FormData): Promise<AuthActionResult> {
  const email = (formData.get('email') as string || '').trim().toLowerCase();
  const password = formData.get('password') as string || '';

  if (!email || !password) {
    return { success: false, error: 'Invalid email or password.' };
  }

  const headersList = await headers();
  const ip = getTrustedClientIp(headersList);
  const userAgent = headersList.get('user-agent') || 'unknown';

  // 1. Rate Limit Check
  const rateCheck = checkAuthRateLimit(ip, 'login');
  if (!rateCheck.allowed) {
    const minutes = Math.ceil((rateCheck.retryAfterMs || 0) / 60000);
    return {
      success: false,
      error: `Too many failed login attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
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
  let userId = '';

  try {
    const authData = await pb.collection('users').authWithPassword(email, password);
    const record = authData.record;
    userId = record.id;

    let role = record.role as string | undefined;
    if (role === 'admin') {
      role = 'super_admin';
    }

    const validAdminRoles: AdminRole[] = ['super_admin', 'store_manager', 'content_editor', 'support_staff', 'read_only'];

    if (role && validAdminRoles.includes(role as AdminRole)) {
      success = true;
      userRole = role as AdminRole;
    } else if (record.isAdmin === true || record.is_admin === true) {
      success = true;
      userRole = 'super_admin';
    } else {
      pb.authStore.clear();
      // Execute dummy KDF to preserve execution timing
      await executeDummyKdf();
    }
  } catch {
    // Execute dummy KDF to preserve constant-time execution and prevent user enumeration
    await executeDummyKdf();
  }

  if (success) {
    clearAuthAttempts(ip, 'login');

    const cookieStore = await cookies();

    cookieStore.set('pb_auth_token', pb.authStore.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    cookieStore.set('pb_auth_role', userRole, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

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
  recordAuthAttempt(ip, 'login');

  writeAuditLog(
    email,
    'login',
    'auth',
    undefined,
    undefined,
    { success: false, ip },
    { ip, userAgent }
  );

  // Return uniform, generic error message (OWASP Standard)
  return { success: false, error: 'Invalid email or password.' };
}

// ─── SignUp Action ────────────────────────────────────────────────────────────

/**
 * Server action to register a new user account.
 * Follows OWASP Anti-User-Enumeration and Rate Limiting standards.
 */
export async function signUpAction(formData: FormData): Promise<AuthActionResult> {
  const name = (formData.get('name') as string || '').trim();
  const email = (formData.get('email') as string || '').trim().toLowerCase();
  const password = formData.get('password') as string || '';

  if (!email || !password || password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long.' };
  }

  const headersList = await headers();
  const ip = getTrustedClientIp(headersList);
  const userAgent = headersList.get('user-agent') || 'unknown';

  const rateCheck = checkAuthRateLimit(ip, 'signup');
  if (!rateCheck.allowed) {
    const minutes = Math.ceil((rateCheck.retryAfterMs || 0) / 60000);
    return {
      success: false,
      error: `Too many registration attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
    };
  }

  try {
    const adminPb = await getAdminPb();
    
    // Check if user exists (Anti-enumeration: don't reveal existence to client)
    let existingUser = null;
    try {
      existingUser = await adminPb.collection('users').getFirstListItem(
        adminPb.filter('email = {:email}', { email })
      );
    } catch {
      // User not found
    }

    if (existingUser) {
      // Run dummy KDF to equalize timing with real password hashing/creation
      await executeDummyKdf();
      recordAuthAttempt(ip, 'signup');
      
      // OWASP Uniform anti-enumeration response
      return { 
        success: true, 
        message: 'If the email address is eligible, account registration instructions have been processed.' 
      };
    }

    // Create user in PocketBase (PocketBase handles adaptive KDF password hashing)
    const newUser = await adminPb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      name,
      role: 'read_only',
    });

    writeAuditLog(
      email,
      'create',
      'users',
      newUser.id,
      undefined,
      { email, name, role: 'read_only' },
      { ip, userAgent }
    );

    return { 
      success: true, 
      message: 'If the email address is eligible, account registration instructions have been processed.' 
    };
  } catch {
    await executeDummyKdf();
    recordAuthAttempt(ip, 'signup');
    return { 
      success: true, 
      message: 'If the email address is eligible, account registration instructions have been processed.' 
    };
  }
}

// ─── Forgot Password Action ───────────────────────────────────────────────────

/**
 * Server action to initiate password reset.
 * Generates 256-bit secure random token, stores SHA-256 hash with 1-hour TTL,
 * and enforces uniform response & timing (OWASP anti-user-enumeration).
 */
export async function forgotPasswordAction(formData: FormData): Promise<AuthActionResult> {
  const email = (formData.get('email') as string || '').trim().toLowerCase();

  if (!email) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  const headersList = await headers();
  const ip = getTrustedClientIp(headersList);

  const rateCheck = checkAuthRateLimit(ip, 'forgotPassword');
  if (!rateCheck.allowed) {
    const minutes = Math.ceil((rateCheck.retryAfterMs || 0) / 60000);
    return {
      success: false,
      error: `Too many password reset requests. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
    };
  }

  // Uniform generic OWASP success message
  const uniformResponse: AuthActionResult = {
    success: true,
    message: 'If an account matching that email address exists, a password reset link has been sent.',
  };

  try {
    const adminPb = await getAdminPb();
    let user = null;
    try {
      user = await adminPb.collection('users').getFirstListItem(
        adminPb.filter('email = {:email}', { email })
      );
    } catch {
      // User not found
    }

    if (!user) {
      // Perform dummy operations for timing consistency
      crypto.randomBytes(32);
      await executeDummyKdf();
      recordAuthAttempt(ip, 'forgotPassword');
      return uniformResponse;
    }

    // 1. Revoke existing tokens for this user
    await revokeUserTokens(email);

    // 2. Generate 256-bit cryptographically secure random token
    const rawToken = crypto.randomBytes(32).toString('hex');

    // 3. Compute SHA-256 one-way cryptographic hash of the token for storage
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // 4. Strict 1-hour TTL (3600000 ms)
    const expiresAt = Date.now() + 60 * 60 * 1000;

    // 5. Store hashed token
    await saveResetTokenRecord({
      email,
      tokenHash,
      expiresAt,
      used: false,
    });

    // Write audit log entry
    writeAuditLog(email, 'update', 'users', user.id, undefined, { action: 'forgot_password_request' }, { ip });

    return uniformResponse;
  } catch {
    await executeDummyKdf();
    recordAuthAttempt(ip, 'forgotPassword');
    return uniformResponse;
  }
}

// ─── Reset Password Action ────────────────────────────────────────────────────

/**
 * Server action to complete password reset using secure token.
 * Validates token hash, 1-hour TTL, single-use status, and applies slow KDF.
 */
export async function resetPasswordAction(formData: FormData): Promise<AuthActionResult> {
  const token = formData.get('token') as string || '';
  const password = formData.get('password') as string || '';
  const confirmPassword = formData.get('confirmPassword') as string || '';

  if (!token) {
    return { success: false, error: 'Invalid or missing reset token.' };
  }

  if (!password || password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long.' };
  }

  if (password !== confirmPassword) {
    return { success: false, error: 'Passwords do not match.' };
  }

  const headersList = await headers();
  const ip = getTrustedClientIp(headersList);

  const rateCheck = checkAuthRateLimit(ip, 'resetPassword');
  if (!rateCheck.allowed) {
    const minutes = Math.ceil((rateCheck.retryAfterMs || 0) / 60000);
    return {
      success: false,
      error: `Too many attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
    };
  }

  // Hash incoming token using SHA-256 to compare against stored hash
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const record = await findResetTokenRecord(tokenHash);

  // Validate token existence, single-use enforcement, and 1-hour TTL
  if (!record || record.used || record.expiresAt < Date.now()) {
    await executeDummyKdf();
    recordAuthAttempt(ip, 'resetPassword');
    return { success: false, error: 'Invalid or expired password reset token.' };
  }

  try {
    const adminPb = await getAdminPb();
    const user = await adminPb.collection('users').getFirstListItem(
      adminPb.filter('email = {:email}', { email: record.email })
    );

    // Update user password in PocketBase (adaptive KDF applied by PB)
    await adminPb.collection('users').update(user.id, {
      password,
      passwordConfirm: password,
    });

    // Mark token as used (single-use enforcement)
    await markTokenUsed(tokenHash, record);

    // Revoke all remaining tokens for user
    await revokeUserTokens(record.email);

    writeAuditLog(record.email, 'update', 'users', user.id, undefined, { action: 'password_reset_success' }, { ip });

    return { 
      success: true, 
      message: 'Your password has been successfully reset. You may now log in with your new password.' 
    };
  } catch {
    await executeDummyKdf();
    recordAuthAttempt(ip, 'resetPassword');
    return { success: false, error: 'Invalid or expired password reset token.' };
  }
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

  let actorEmail = 'unknown';
  const token = cookieStore.get('pb_auth_token')?.value;
  if (token) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        const decoded = atob(padded);
        const payload = JSON.parse(decoded);
        actorEmail = payload.email || payload.sub || 'unknown';
      }
    } catch {
      // Ignore
    }
  }

  cookieStore.delete('pb_auth_token');
  cookieStore.delete('pb_auth_role');

  writeAuditLog(actorEmail, 'logout', 'auth', undefined, undefined, { ip }, { ip });

  return { success: true };
}

