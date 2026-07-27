'use server';

import { cookies, headers } from 'next/headers';
import crypto from 'crypto';
import PocketBase from 'pocketbase';
import { getAdminPb, writeAuditLog } from '@/lib/pb-admin';
import { getTrustedClientIp } from '@/lib/get-client-ip';
import { sendPasswordResetEmail, sendOtpEmail } from '@/lib/email';
import { type AdminRole, ADMIN_ROLES } from '@/types/admin';

function scryptAsync(password: string, salt: string, keylen: number, options: crypto.ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

// Derived key for GCM encryption of OTP database password fields.
// Requires a dedicated OTP_ENCRYPTION_KEY — never share this with other secrets.
// Fails fast in production if the env var is missing so misconfiguration is caught at deploy time.
const otpKeyMaterial = process.env.OTP_ENCRYPTION_KEY;
if (!otpKeyMaterial && process.env.NODE_ENV === 'production') {
  throw new Error('OTP_ENCRYPTION_KEY is required to encrypt pending signup credentials.');
}
const OTP_ENCRYPTION_SECRET = crypto.createHash('sha256')
  .update(otpKeyMaterial || 'dev-only-insecure-otp-key')
  .digest();

function encryptPassword(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', OTP_ENCRYPTION_SECRET, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypts an AES-256-GCM ciphertext produced by encryptPassword.
 * Returns null if the format is invalid or the GCM auth-tag check fails
 * (tampered / key-mismatched record) so callers can handle it explicitly.
 */
function decryptPassword(cipherText: string): string | null {
  const parts = cipherText.split(':');
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', OTP_ENCRYPTION_SECRET, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(parts[1], 'hex', 'utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
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
  verifyOtp: { maxAttempts: 5, windowMs: 15 * 60 * 1000 },      // 5 attempts per 15 mins
};

const DEFAULT_RATE_LIMIT: RateLimitConfig = { maxAttempts: 5, windowMs: 15 * 60 * 1000 };

const rateLimitStore = new Map<string, { count: number; lastAttempt: number; action: string }>();

function cleanupExpiredRateLimits(): void {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    const config = ACTION_RATE_LIMITS[record.action] ?? DEFAULT_RATE_LIMIT;
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
  const config = ACTION_RATE_LIMITS[action] ?? DEFAULT_RATE_LIMIT;
  const key = `${ip}#${action}`;
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
  const key = `${ip}#${action}`;
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (record) {
    record.count += 1;
    record.lastAttempt = now;
  } else {
    rateLimitStore.set(key, { count: 1, lastAttempt: now, action });
  }
}

function clearAuthAttempts(ip: string, action: string): void {
  const key = `${ip}#${action}`;
  rateLimitStore.delete(key);
}

/**
 * Consolidates setting authentication cookies securely in the client browser.
 */
async function setSessionCookies(params: {
  token: string;
  role: AdminRole | 'customer';
  name: string;
  avatarUrl?: string;
}): Promise<void> {
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === 'production';

  // Shared base keeps all security attributes in one place — change once, applies everywhere.
  const base = {
    secure,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  };

  cookieStore.set('pb_auth_token', params.token, { ...base, httpOnly: true });
  cookieStore.set('pb_auth_role', params.role, { ...base, httpOnly: true });
  cookieStore.set('pb_auth_indicator', '1', { ...base, httpOnly: false });
  cookieStore.set('pb_auth_name', encodeURIComponent(params.name), { ...base, httpOnly: false });
  cookieStore.set(
    'pb_auth_avatar',
    params.avatarUrl ? encodeURIComponent(params.avatarUrl) : '',
    { ...base, httpOnly: false, maxAge: params.avatarUrl ? base.maxAge : 0 }
  );
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
    const oldestKeys = Array.from(memoryTokenStore.entries())
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
      .slice(0, 500)
      .map(([k]) => k);
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
  } catch (err) {
    console.error('[RESET TOKEN STORE ERROR] Failed to save reset token record to database:', err);
  }
}

async function findResetTokenRecord(tokenHash: string): Promise<ResetTokenRecord | null> {
  cleanupExpiredTokens();

  // 1. Query persistent PocketBase database first for multi-replica/distributed node consistency
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
  } catch (err) {
    console.error('[RESET TOKEN STORE ERROR] Failed to fetch reset token record from database:', err);
  }

  // 2. Process-memory fallback
  const memoryRecord = memoryTokenStore.get(tokenHash);
  if (memoryRecord && memoryRecord.expiresAt >= Date.now()) {
    return memoryRecord;
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
  } catch (err) {
    console.error('[RESET TOKEN STORE ERROR] Failed to mark reset token as used in database:', err);
  }
}

async function revokeUserTokens(email: string): Promise<void> {
  const now = Date.now();
  for (const [hash, rec] of memoryTokenStore.entries()) {
    if (rec.email.toLowerCase() === email.toLowerCase()) {
      rec.used = true;
      memoryTokenStore.set(hash, rec);
    }
  }

  try {
    const pb = await getAdminPb();
    const records = await pb.collection('password_reset_tokens').getFullList({
      filter: pb.filter('email = {:email} && used = false && expires_at >= {:now}', { email, now }),
    });
    if (records.length > 0) {
      await Promise.all(records.map((rec) => pb.collection('password_reset_tokens').update(rec.id, { used: true })));
    }
  } catch (err) {
    console.error('[RESET TOKEN STORE ERROR] Failed to revoke active reset tokens in database:', err);
  }
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface AuthActionResult {
  success: boolean;
  error?: string;
  message?: string;
  role?: AdminRole | 'customer';
  requiresOtp?: boolean;
  otpId?: string;
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
  let userRole: AdminRole | 'customer' = 'customer';
  let userId = '';

  try {
    const authData = await pb.collection('users').authWithPassword(email, password);
    const record = authData.record;
    userId = record.id;

    let role = record.role as string | undefined;
    if (role === 'admin') {
      role = 'super_admin';
    }

    if (role && (ADMIN_ROLES as readonly string[]).includes(role)) {
      success = true;
      userRole = role as AdminRole;
    } else if (record.isAdmin === true || record.is_admin === true) {
      success = true;
      userRole = 'super_admin';
    } else {
      success = true;
      userRole = 'customer';
    }
  } catch {
    // Execute dummy KDF to preserve constant-time execution and prevent user enumeration
    await executeDummyKdf();
  }

  if (success) {
    clearAuthAttempts(ip, 'login');

    const model = pb.authStore.record;
    const displayName = model?.name || email.split('@')[0];
    const avatarUrl = model?.avatar
      ? `${pbUrl}/api/files/_pb_users_auth_/${model.id}/${model.avatar}`
      : undefined;

    await setSessionCookies({
      token: pb.authStore.token,
      role: userRole,
      name: displayName,
      avatarUrl,
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

/**
 * Establishes a server session cookie after a successful client OAuth2 authentication flow.
 */
export async function setOAuthSessionAction(token: string): Promise<AuthActionResult> {
  if (!token) {
    return { success: false, error: 'OAuth token is required.' };
  }

  const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
  if (!pbUrl) {
    return { success: false, error: 'Server configuration error.' };
  }

  try {
    const pb = new PocketBase(pbUrl);
    pb.authStore.save(token, null);

    // Cryptographically verify token signature & refresh record against PocketBase
    let record;
    try {
      const refreshed = await pb.collection('users').authRefresh();
      record = refreshed.record;
    } catch {
      return { success: false, error: 'Invalid authentication token.' };
    }

    if (!record) {
      return { success: false, error: 'Invalid authentication token.' };
    }

    let userRole: AdminRole | 'customer' = 'customer';
    const role = record.role as string | undefined;

    // Check role validity against defined AdminRoles
    if (role && (ADMIN_ROLES as readonly string[]).includes(role)) {
      userRole = role as AdminRole;
    } else if (record.isAdmin === true || record.is_admin === true) {
      userRole = 'super_admin';
    } else {
      // New OAuth customer with no role set yet -> Provision in database
      if (!record.role && record.id) {
        try {
          const adminPb = await getAdminPb();
          await adminPb.collection('users').update(record.id, { role: 'customer' });
        } catch (provisionErr) {
          console.error('[setOAuthSessionAction] Role provisioning failed:', provisionErr);
        }
      }
      userRole = 'customer';
    }

    const headersList = await headers();
    const ip = getTrustedClientIp(headersList);
    const userAgent = headersList.get('user-agent') || 'unknown';

    const displayName = record.name || record.email?.split('@')[0] || 'User';
    const avatarUrl = record.avatar
      ? `${pbUrl}/api/files/_pb_users_auth_/${record.id}/${record.avatar}`
      : undefined;

    await setSessionCookies({
      token,
      role: userRole,
      name: displayName,
      avatarUrl,
    });

    writeAuditLog(
      record.email || 'oauth_user',
      'login',
      'auth',
      record.id,
      undefined,
      { role: userRole, provider: 'google', ip },
      { ip, userAgent }
    );

    return { success: true, role: userRole };
  } catch (err) {
    console.error('[setOAuthSessionAction] Failed:', err);
    return { success: false, error: 'Failed to complete OAuth authentication.' };
  }
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
  const confirmPassword = formData.get('confirmPassword') as string || '';

  if (!email) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  if (!password || password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long.' };
  }

  if (password !== confirmPassword) {
    return { success: false, error: 'Passwords do not match.' };
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
    
    // Check if user already exists
    let existingUser = null;
    try {
      existingUser = await adminPb.collection('users').getFirstListItem(
        adminPb.filter('email = {:email}', { email })
      );
    } catch {
      // User not found
    }

    if (existingUser) {
      return { 
        success: false, 
        error: 'An account with this email address already exists.' 
      };
    }

    // Prune expired signup OTP records — capped at 50 to avoid unbounded sequential deletes.
    try {
      const expiredOtps = await adminPb.collection('signup_otps').getList(1, 50, {
        filter: adminPb.filter('expiresAt < {:now}', { now: new Date().toISOString() }),
        fields: 'id',
      });
      await Promise.all(
        expiredOtps.items.map((oldOtp) =>
          adminPb.collection('signup_otps').delete(oldOtp.id).catch(() => {})
        )
      );
    } catch (pruneErr) {
      console.error('Failed to prune expired OTPs:', pruneErr);
    }

    // Generate 6-digit random code using cryptographically secure random integers
    const code = (100000 + crypto.randomInt(900000)).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes TTL

    // Create temporary record in PocketBase signup_otps collection
    const tempSignup = await adminPb.collection('signup_otps').create({
      email,
      code,
      name,
      password: encryptPassword(password), // Save encrypted temporary password to create user upon verification
      expiresAt,
      attempts: 0,
    });

    // Send OTP email
    const emailResult = await sendOtpEmail({
      to: email,
      code,
      expiresMinutes: 10,
    });

    if (!emailResult.success) {
      // Clean up on failure
      try {
        await adminPb.collection('signup_otps').delete(tempSignup.id);
      } catch {}
      return {
        success: false,
        error: emailResult.error || 'Failed to send verification code. Please try again.',
      };
    }

    return { 
      success: true, 
      requiresOtp: true,
      otpId: tempSignup.id,
      message: 'A 6-digit verification code has been sent to your email.' 
    };
  } catch (err) {
    console.error('[signUpAction] Registration failed:', err);
    recordAuthAttempt(ip, 'signup');
    return { 
      success: false, 
      error: 'Unable to complete registration right now. Please try again.' 
    };
  }
}

/**
 * Verifies OTP and creates the real user account.
 */
export async function verifyOtpAction(otpId: string, code: string): Promise<AuthActionResult> {
  if (!otpId || !code) {
    return { success: false, error: 'Verification code is required.' };
  }

  const headersList = await headers();
  const ip = getTrustedClientIp(headersList);
  const userAgent = headersList.get('user-agent') || 'unknown';

  // 1. IP-based Rate Limit Check
  const rateCheck = checkAuthRateLimit(ip, 'verifyOtp');
  if (!rateCheck.allowed) {
    const minutes = Math.ceil((rateCheck.retryAfterMs || 0) / 60000);
    return {
      success: false,
      error: `Too many verification attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`
    };
  }

  try {
    const adminPb = await getAdminPb();
    
    // Fetch temp signup record
    let record: any;
    try {
      record = await adminPb.collection('signup_otps').getOne(otpId);
    } catch {
      return { success: false, error: 'Verification session expired. Please sign up again.' };
    }

    const currentAttempts = Number(record.attempts || 0);

    // 2. Brute Force Protection (Check/Self-Destruct if limit exceeded)
    if (currentAttempts >= 5) {
      try {
        await adminPb.collection('signup_otps').delete(otpId);
      } catch {}
      return { success: false, error: 'Too many incorrect verification attempts. Please sign up again.' };
    }

    // Verify OTP code
    if (record.code !== code.trim()) {
      recordAuthAttempt(ip, 'verifyOtp');

      // Atomic server-side increment: avoids read-modify-write race across concurrent requests.
      let newAttempts = currentAttempts + 1;
      try {
        const updated = await adminPb.collection('signup_otps').update(otpId, {
          'attempts+': 1,
        });
        newAttempts = Number(updated.attempts ?? newAttempts);
      } catch {}

      if (newAttempts >= 5) {
        try {
          await adminPb.collection('signup_otps').delete(otpId);
        } catch {}
        return { success: false, error: 'Too many incorrect verification attempts. Please sign up again.' };
      }

      return { success: false, error: 'Incorrect verification code. Please check and try again.' };
    }

    // Check expiration
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      try {
        await adminPb.collection('signup_otps').delete(otpId);
      } catch {}
      return { success: false, error: 'Verification code has expired. Please sign up again.' };
    }

    // Double check if user was created in the meantime
    let existingUser = null;
    try {
      existingUser = await adminPb.collection('users').getFirstListItem(
        adminPb.filter('email = {:email}', { email: record.email })
      );
    } catch {}

    if (existingUser) {
      try {
        await adminPb.collection('signup_otps').delete(otpId);
      } catch {}
      return { success: false, error: 'An account with this email address already exists.' };
    }

    // Decrypt the temporary user password — returns null if tampered or key-mismatched.
    const decryptedPassword = decryptPassword(record.password);
    if (decryptedPassword === null) {
      console.error('[verifyOtpAction] decryptPassword returned null for otpId:', otpId);
      try {
        await adminPb.collection('signup_otps').delete(otpId);
      } catch {}
      return { success: false, error: 'Verification session is invalid. Please sign up again.' };
    }

    // Create real user in users collection
    const newUser = await adminPb.collection('users').create({
      email: record.email,
      password: decryptedPassword,
      passwordConfirm: decryptedPassword,
      name: record.name,
      role: 'customer',
    });

    // Delete temporary OTP record
    try {
      await adminPb.collection('signup_otps').delete(otpId);
    } catch {}

    writeAuditLog(
      record.email,
      'create',
      'users',
      newUser.id,
      undefined,
      { email: record.email, name: record.name, role: 'customer' },
      { ip, userAgent }
    );

    // Authenticate new user automatically to log them in
    const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
    if (!pbUrl) {
      return { success: true, message: 'Account verified successfully! Please sign in.' };
    }

    const pb = new PocketBase(pbUrl);

    // Use decryptedPassword (not record.password which holds the AES-GCM ciphertext).
    // Wrap in try/catch: a login failure must not discard the successfully created account.
    let authData;
    try {
      authData = await pb.collection('users').authWithPassword(record.email, decryptedPassword);
    } catch (loginErr) {
      console.error('[verifyOtpAction] Auto-login after signup failed:', loginErr);
      return { success: true, message: 'Account verified successfully! Please sign in.' };
    }

    if (authData?.token) {
      const displayName = record.name || record.email.split('@')[0] || 'User';
      const avatarUrl = authData.record?.avatar
        ? `${pbUrl}/api/files/_pb_users_auth_/${authData.record.id}/${authData.record.avatar}`
        : undefined;

      await setSessionCookies({
        token: authData.token,
        role: 'customer',
        name: displayName,
        avatarUrl,
      });
      
      // Notify navbar client-side
      return { success: true, role: 'customer' };
    }

    return { 
      success: true, 
      message: 'Account verified successfully! Please sign in.' 
    };
  } catch (err: any) {
    console.error('[verifyOtpAction] Verification/login failed:', err);
    return { 
      success: false, 
      error: 'Unable to complete verification right now. Please try again.' 
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

  // Unconditionally record the attempt against rate limiter for every valid request
  recordAuthAttempt(ip, 'forgotPassword');

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

    // 6. Build reset URL & dispatch email via Resend / Dev Fallback
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail({ to: email, resetUrl });

    // Write audit log entry
    writeAuditLog(email, 'update', 'users', user.id, undefined, { action: 'forgot_password_request' }, { ip });

    return uniformResponse;
  } catch (err) {
    console.error('[forgotPasswordAction] Failed to process password reset request:', err);
    await executeDummyKdf();
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
  } catch (err) {
    console.error('[resetPasswordAction] Failed to apply reset:', err);
    await executeDummyKdf();
    recordAuthAttempt(ip, 'resetPassword');
    return { success: false, error: 'Unable to reset your password right now. Please try again.' };
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
  cookieStore.delete('pb_auth_indicator');
  cookieStore.delete('pb_auth_name');
  cookieStore.delete('pb_auth_avatar');

  writeAuditLog(actorEmail, 'logout', 'auth', undefined, undefined, { ip }, { ip });

  return { success: true };
}

export interface CustomerProfileData {
  id: string;
  email: string;
  name: string;
  phone?: string;
  address?: string;
  role: string;
  created: string;
  avatar?: string;
}

/**
 * Retrieves the currently logged-in user profile from PocketBase session cookie.
 */
export async function getCurrentUserSessionAction(): Promise<{
  success: boolean;
  user?: CustomerProfileData;
  error?: string;
}> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('pb_auth_token')?.value;

    if (!token) {
      return { success: false, error: 'Not authenticated.' };
    }

    const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
    if (!pbUrl) return { success: false, error: 'Server error.' };

    // Instantiate client with user's own token to verify signature authenticity
    const pb = new PocketBase(pbUrl);
    pb.authStore.save(token, null);

    // authRefresh will validate the token against PocketBase's secret and throw if forged/expired
    const authData = await pb.collection('users').authRefresh();
    const record = authData.record;

    if (!record) {
      return { success: false, error: 'Not authenticated.' };
    }

    const avatarUrl = record.avatar
      ? `${pbUrl}/api/files/_pb_users_auth_/${record.id}/${record.avatar}`
      : undefined;

    return {
      success: true,
      user: {
        id: record.id,
        email: record.email || '',
        name: record.name || record.username || record.email?.split('@')[0] || 'Customer',
        phone: record.phone || '',
        address: record.address || '',
        role: record.role || 'read_only',
        created: record.created || new Date().toISOString(),
        avatar: avatarUrl,
      },
    };
  } catch {
    return { success: false, error: 'Failed to load user profile.' };
  }
}

/**
 * Updates the current logged-in customer's profile details in PocketBase.
 */
export async function updateUserProfilePageAction(data: {
  name: string;
  phone?: string;
  address?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('pb_auth_token')?.value;

    if (!token) return { success: false, error: 'Not authenticated.' };

    const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
    if (!pbUrl) return { success: false, error: 'Server error.' };

    // Instantiate client with user's own token to verify signature authenticity
    const pb = new PocketBase(pbUrl);
    pb.authStore.save(token, null);

    // authRefresh will validate the token against PocketBase's secret and throw if forged/expired
    const authData = await pb.collection('users').authRefresh();
    const record = authData.record;

    if (!record) {
      return { success: false, error: 'Not authenticated.' };
    }

    // Perform update on the authenticated client instance to enforce PB policy security rules
    await pb.collection('users').update(record.id, {
      name: data.name,
      phone: data.phone,
      address: data.address,
    });

    // Also update the name cookie so navbar avatar reflects new name
    cookieStore.set('pb_auth_name', encodeURIComponent(data.name || ''), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return { success: true };
  } catch (err: any) {
    console.error('[updateUserProfilePageAction] Failed:', err);
    return { success: false, error: 'Failed to update profile.' };
  }
}

/**
 * Fetches real customer orders matching the authenticated user's email.
 */
export async function getCustomerOrdersAction(): Promise<{
  success: boolean;
  orders: any[];
  error?: string;
}> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('pb_auth_token')?.value;

    if (!token) return { success: false, orders: [], error: 'Not authenticated.' };

    const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
    if (!pbUrl) return { success: false, orders: [], error: 'Server error.' };

    // Instantiate client with user's own token to verify signature authenticity
    const pb = new PocketBase(pbUrl);
    pb.authStore.save(token, null);

    // authRefresh will validate the token against PocketBase's secret and throw if forged/expired
    const authData = await pb.collection('users').authRefresh();
    const record = authData.record;

    if (!record) {
      return { success: false, orders: [], error: 'Not authenticated.' };
    }

    const userEmail = record.email || '';
    if (!userEmail) return { success: false, orders: [], error: 'User email not found.' };

    const adminPb = await getAdminPb();
    let records: any[] = [];
    try {
      records = await adminPb.collection('orders').getFullList({
        filter: adminPb.filter('customer_email = {:email} || email = {:email}', { email: userEmail }),
        sort: '-created',
      });
    } catch {
      // Return empty list if orders collection doesn't exist yet
    }

    return { success: true, orders: records };
  } catch (err: any) {
    console.error('[getCustomerOrdersAction] Failed:', err);
    return { success: false, orders: [], error: 'Failed to load orders.' };
  }
}

