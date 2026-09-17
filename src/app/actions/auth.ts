'use server';

import { cookies, headers } from 'next/headers';
import crypto from 'crypto';
import PocketBase from 'pocketbase';
import { getAdminSupabase, writeAuditLog } from '@/lib/supabase-admin';
import { getTrustedClientIp } from '@/lib/get-client-ip';
import { sendPasswordResetEmail, sendOtpEmail } from '@/lib/email';
import { type AdminRole, ADMIN_ROLES } from '@/types/admin';
import type { User, SupabaseClient } from '@supabase/supabase-js';

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

const globalForAuthStores = globalThis as unknown as {
  __rateLimitStore?: Map<string, { count: number; lastAttempt: number; action: string }>;
  __memoryTokenStore?: Map<string, ResetTokenRecord>;
};

const rateLimitStore = globalForAuthStores.__rateLimitStore ??= new Map<string, { count: number; lastAttempt: number; action: string }>();
const memoryTokenStore = globalForAuthStores.__memoryTokenStore ??= new Map<string, ResetTokenRecord>();

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
  refreshToken?: string;
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
  if (params.refreshToken) {
    cookieStore.set('pb_auth_refresh_token', params.refreshToken, { ...base, httpOnly: true });
  }
  cookieStore.set('pb_auth_role', params.role, { ...base, httpOnly: true });
  cookieStore.set('pb_auth_indicator', '1', { ...base, httpOnly: false });
  cookieStore.set('pb_auth_name', encodeURIComponent(params.name), { ...base, httpOnly: false });
  cookieStore.set(
    'pb_auth_avatar',
    params.avatarUrl ? encodeURIComponent(params.avatarUrl) : '',
    { ...base, httpOnly: false, maxAge: params.avatarUrl ? base.maxAge : 0 }
  );
}

/**
 * Retrieves the currently authenticated Supabase user from cookies, automatically
 * refreshing the access token if expired using the stored refresh token.
 */
async function getAuthenticatedCustomerUser(supabase: SupabaseClient): Promise<{ user: User | null; token?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get('pb_auth_token')?.value;
  const refreshToken = cookieStore.get('pb_auth_refresh_token')?.value;

  if (!token && !refreshToken) {
    return { user: null };
  }

  if (token) {
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (!authErr && user) {
      return { user, token };
    }
  }

  if (refreshToken) {
    try {
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (!error && data?.session && data?.user) {
        const secure = process.env.NODE_ENV === 'production';
        const base = {
          secure,
          sameSite: 'strict' as const,
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        };
        cookieStore.set('pb_auth_token', data.session.access_token, { ...base, httpOnly: true });
        if (data.session.refresh_token) {
          cookieStore.set('pb_auth_refresh_token', data.session.refresh_token, { ...base, httpOnly: true });
        }
        return { user: data.user, token: data.session.access_token };
      }
    } catch {
      // Refresh failed
    }
  }

  return { user: null };
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
    const supabase = getAdminSupabase();
    const { data, error } = await supabase.from('password_reset_tokens').insert({
      email: record.email,
      token_hash: record.tokenHash,
      expires_at: record.expiresAt,
      used: record.used,
    }).select().single();
    if (error) throw error;
    record.id = data.id;
    memoryTokenStore.set(hashKey, record);
  } catch (err) {
    console.error('[RESET TOKEN STORE ERROR] Failed to save reset token record to database:', err);
  }
}

async function findResetTokenRecord(tokenHash: string): Promise<ResetTokenRecord | null> {
  cleanupExpiredTokens();

  try {
    const supabase = getAdminSupabase();
    const { data: record, error } = await supabase
      .from('password_reset_tokens')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();
      
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
    const supabase = getAdminSupabase();
    let targetId = record.id;
    if (!targetId) {
      const { data: dbRec } = await supabase
        .from('password_reset_tokens')
        .select('id')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (dbRec) targetId = dbRec.id;
    }
    if (targetId) {
      await supabase.from('password_reset_tokens').update({ used: true }).eq('id', targetId);
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
    const supabase = getAdminSupabase();
    await supabase
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('email', email)
      .eq('used', false)
      .gte('expires_at', now);
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

  let success = false;
  let userRole: AdminRole | 'customer' = 'customer';
  let userId = '';
  let token = '';
  let refreshToken = '';
  let displayName = email.split('@')[0];

  try {
    const supabase = getAdminSupabase();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (!authError && authData?.session && authData.user) {
      success = true;
      userId = authData.user.id;
      token = authData.session.access_token;
      refreshToken = authData.session.refresh_token;
      
      const { data: publicUser } = await supabase.from('users').select('id, role, is_admin, name').eq('id', authData.user.id).maybeSingle();
      const role = publicUser?.role || (authData.user.user_metadata?.role as string);
      if (role && (ADMIN_ROLES as readonly string[]).includes(role)) {
        userRole = role as AdminRole;
      } else if (publicUser?.is_admin === true) {
        userRole = 'super_admin';
      } else {
        userRole = 'customer';
      }
      displayName = publicUser?.name || authData.user.user_metadata?.name || email.split('@')[0];
    } else {
      await executeDummyKdf();
    }
  } catch {
    await executeDummyKdf();
  }

  if (success) {
    clearAuthAttempts(ip, 'login');

    await setSessionCookies({
      token,
      refreshToken,
      role: userRole,
      name: displayName,
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

  return { success: false, error: 'Invalid email or password.' };
}

async function checkUserAuth() {
  const cookieStore = await cookies();
  return cookieStore.get('pb_auth_token')?.value || cookieStore.get('pb_auth_refresh_token')?.value;
}

/**
 * Establishes a server session cookie after a successful client OAuth2 authentication flow.
 */
export async function setOAuthSessionAction(token: string, refreshToken?: string): Promise<AuthActionResult> {
  await checkUserAuth();
  if (!token && !refreshToken) {
    return { success: false, error: 'OAuth token is required.' };
  }

  try {
    const supabase = getAdminSupabase();
    let user: User | null = null;
    let finalAccessToken = token;
    let finalRefreshToken = refreshToken;

    if (token) {
      const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
      if (!authErr && authUser) {
        user = authUser;
      }
    }

    if (!user && refreshToken) {
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (!refreshErr && refreshData?.session && refreshData?.user) {
        user = refreshData.user;
        finalAccessToken = refreshData.session.access_token;
        finalRefreshToken = refreshData.session.refresh_token;
      }
    }
    
    if (!user) {
      return { success: false, error: 'Invalid authentication token.' };
    }

    const { data: publicUser } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
    let userRole: AdminRole | 'customer' = 'customer';
    const role = publicUser?.role || user.user_metadata?.role;
    
    if (role && (ADMIN_ROLES as readonly string[]).includes(role)) {
      userRole = role as AdminRole;
    } else if (publicUser?.is_admin === true) {
      userRole = 'super_admin';
    } else {
      userRole = 'customer';
    }

    const headersList = await headers();
    const ip = getTrustedClientIp(headersList);
    const userAgent = headersList.get('user-agent') || 'unknown';

    const displayName = publicUser?.name || user.user_metadata?.name || user.email?.split('@')[0] || 'User';

    await setSessionCookies({
      token: finalAccessToken,
      refreshToken: finalRefreshToken,
      role: userRole,
      name: displayName,
    });

    writeAuditLog(
      user.email || 'oauth_user',
      'login',
      'auth',
      user.id,
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
    const supabase = getAdminSupabase();
    
    // Check if user already exists
    const { data: existingUser } = await supabase.from('users').select('id').eq('email', email).maybeSingle();

    if (existingUser) {
      return { 
        success: false, 
        error: 'An account with this email address already exists.' 
      };
    }

    // Prune expired signup OTP records
    try {
      const nowStr = new Date().toISOString();
      await supabase.from('signup_otps').delete().lt('expires_at', nowStr);
    } catch (pruneErr) {
      console.error('Failed to prune expired OTPs:', pruneErr);
    }

    // Generate 6-digit random code using cryptographically secure random integers
    const code = (100000 + crypto.randomInt(900000)).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes TTL

    // Create temporary record in Supabase signup_otps table
    const { data: tempSignup, error: insertErr } = await supabase.from('signup_otps').insert({
      email,
      code,
      name,
      password: encryptPassword(password), // Save encrypted temporary password to create user upon verification
      expires_at: expiresAt,
      attempts: 0,
    }).select().single();

    if (insertErr || !tempSignup) {
      throw insertErr || new Error('Failed to insert temporary OTP record');
    }

    // Send OTP email
    const emailResult = await sendOtpEmail({
      to: email,
      code,
      expiresMinutes: 10,
    });

    if (!emailResult.success) {
      // Clean up on failure
      try {
        await supabase.from('signup_otps').delete().eq('id', tempSignup.id);
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
    const supabase = getAdminSupabase();
    
    // Fetch temp signup record
    const { data: record, error: fetchErr } = await supabase.from('signup_otps').select('*').eq('id', otpId).maybeSingle();
    if (fetchErr || !record) {
      return { success: false, error: 'Verification session expired. Please sign up again.' };
    }
    const currentAttempts = Number(record.attempts || 0);

    // 2. Brute Force Protection
    if (currentAttempts >= 5) {
      try {
        await supabase.from('signup_otps').delete().eq('id', otpId);
      } catch {}
      return { success: false, error: 'Too many incorrect verification attempts. Please sign up again.' };
    }

    // Verify OTP code
    if (record.code !== code.trim()) {
      recordAuthAttempt(ip, 'verifyOtp');

      const newAttempts = currentAttempts + 1;
      try {
        await supabase.from('signup_otps').update({ attempts: newAttempts }).eq('id', otpId);
      } catch {}

      if (newAttempts >= 5) {
        try {
          await supabase.from('signup_otps').delete().eq('id', otpId);
        } catch {}
        return { success: false, error: 'Too many incorrect verification attempts. Please sign up again.' };
      }

      return { success: false, error: 'Incorrect verification code. Please check and try again.' };
    }

    // Check expiration
    if (new Date(record.expires_at).getTime() < Date.now()) {
      try {
        await supabase.from('signup_otps').delete().eq('id', otpId);
      } catch {}
      return { success: false, error: 'Verification code has expired. Please sign up again.' };
    }

    // Double check if user was created in the meantime
    const { data: existingUser } = await supabase.from('users').select('id').eq('email', record.email).maybeSingle();

    if (existingUser) {
      try {
        await supabase.from('signup_otps').delete().eq('id', otpId);
      } catch {}
      return { success: false, error: 'An account with this email address already exists.' };
    }

    // Decrypt the temporary user password
    const decryptedPassword = decryptPassword(record.password);
    if (decryptedPassword === null) {
      console.error('[verifyOtpAction] decryptPassword returned null for otpId:', otpId);
      try {
        await supabase.from('signup_otps').delete().eq('id', otpId);
      } catch {}
      return { success: false, error: 'Verification session is invalid. Please sign up again.' };
    }

    // Create real user in Supabase Auth
    const { data: authUser, error: authCreateErr } = await supabase.auth.admin.createUser({
      email: record.email,
      password: decryptedPassword,
      email_confirm: true,
      user_metadata: { name: record.name, role: 'customer' }
    });

    if (authCreateErr || !authUser?.user) {
      console.error('[verifyOtpAction] User creation in Supabase auth failed:', authCreateErr);
      return { success: false, error: 'Unable to create user account. Please try again.' };
    }

    const newAuthUserId = authUser.user.id;

    // Create user in public.users table
    const { data: publicUser, error: publicUserErr } = await supabase.from('users').insert({
      id: newAuthUserId,
      email: record.email,
      name: record.name,
      role: 'customer',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single();

    if (publicUserErr) {
      console.error('[verifyOtpAction] Failed to insert public user, rolling back auth user:', publicUserErr);
      try {
        await supabase.auth.admin.deleteUser(newAuthUserId);
      } catch (delErr) {
        console.error('[verifyOtpAction] Rollback deleteUser failed:', delErr);
      }
      return {
        success: false,
        error: 'Failed to create user profile. Please try again.',
      };
    }

    // Create record in public.customers table
    const { error: customerErr } = await supabase.from('customers').insert({
      id: newAuthUserId,
      name: record.name,
      email: record.email,
      phone: null,
      orders_count: 0,
      total_spent: 0,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (customerErr) {
      console.error('[verifyOtpAction] Failed to insert customer profile, rolling back users and auth user:', customerErr);
      try {
        await supabase.from('users').delete().eq('id', newAuthUserId);
        await supabase.auth.admin.deleteUser(newAuthUserId);
      } catch (delErr) {
        console.error('[verifyOtpAction] Rollback failed:', delErr);
      }
      return {
        success: false,
        error: 'Failed to initialize customer account. Please try again.',
      };
    }

    // Delete temporary OTP record
    try {
      await supabase.from('signup_otps').delete().eq('id', otpId);
    } catch {}

    writeAuditLog(
      record.email,
      'create',
      'users',
      newAuthUserId,
      undefined,
      { email: record.email, name: record.name, role: 'customer' },
      { ip, userAgent }
    );

    // Authenticate new user automatically to log them in
    let signInData;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: record.email,
        password: decryptedPassword,
      });
      if (error) throw error;
      signInData = data;
    } catch (loginErr) {
      console.error('[verifyOtpAction] Auto-login after signup failed:', loginErr);
      return { success: true, message: 'Account verified successfully! Please sign in.' };
    }

    if (signInData?.session) {
      const displayName = record.name || record.email.split('@')[0] || 'User';

      await setSessionCookies({
        token: signInData.session.access_token,
        refreshToken: signInData.session.refresh_token,
        role: 'customer',
        name: displayName,
      });
      
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
    const supabase = getAdminSupabase();
    let user = null;
    try {
      const { data } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
      user = data;
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
    const supabase = getAdminSupabase();
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('*')
      .eq('email', record.email)
      .maybeSingle();

    if (userErr || !user) {
      throw userErr || new Error('User not found in public database');
    }

    // Update user password in Supabase Auth
    const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(user.id, {
      password: password,
    });
    if (updateAuthErr) throw updateAuthErr;

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
  await checkUserAuth();
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
  cookieStore.delete('pb_auth_refresh_token');
  cookieStore.delete('pb_auth_role');
  cookieStore.delete('pb_auth_indicator');
  cookieStore.delete('pb_auth_name');
  cookieStore.delete('pb_auth_avatar');
  cookieStore.delete('pb_auth_cache');

  writeAuditLog(actorEmail, 'logout', 'auth', undefined, undefined, { ip }, { ip });

  return { success: true };
}

export interface CustomerProfileData {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
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
    const supabase = getAdminSupabase();
    const { user } = await getAuthenticatedCustomerUser(supabase);
    
    if (!user) {
      return { success: false, error: 'Not authenticated.' };
    }

    // Load extra fields from public.users database table if available, or fallback to user metadata
    const { data: publicUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    const fullName = publicUser?.name || user.user_metadata?.name || user.email?.split('@')[0] || 'Customer';
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const phone = publicUser?.phone || user.user_metadata?.phone || '';
    const address = publicUser?.address || user.user_metadata?.address || '';
    
    let addressLine1 = address;
    let addressLine2 = '';
    let city = '';
    let state = '';
    let postalCode = '';
    let country = 'Sri Lanka';

    if (address && address.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(address);
        addressLine1 = parsed.addressLine1 || '';
        addressLine2 = parsed.addressLine2 || '';
        city = parsed.city || '';
        state = parsed.state || '';
        postalCode = parsed.postalCode || '';
        country = parsed.country || 'Sri Lanka';
      } catch {
        addressLine1 = '';
      }
    }

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email || '',
        name: fullName,
        firstName,
        lastName,
        phone,
        address,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country,
        role: publicUser?.role || user.user_metadata?.role || 'customer',
        created: user.created_at || new Date().toISOString(),
        avatar: undefined,
      },
    };
  } catch (err) {
    console.error('[getCurrentUserSessionAction] error:', err);
    return { success: false, error: 'Failed to load user profile.' };
  }
}

/**
 * Updates the current logged-in customer's profile details in PocketBase.
 */
export async function updateUserProfilePageAction(data: {
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  address?: string;
}): Promise<{ success: boolean; error?: string }> {
  await checkUserAuth();
  try {
    const supabase = getAdminSupabase();
    const { user } = await getAuthenticatedCustomerUser(supabase);
    
    if (!user) {
      return { success: false, error: 'Not authenticated.' };
    }

    // Load existing user details
    const { data: publicUser } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();

    const existingNameParts = ((publicUser?.name || user.user_metadata?.name || '').trim()).split(' ');
    const existingFirstName = existingNameParts[0] || '';
    const existingLastName = existingNameParts.slice(1).join(' ') || '';

    const finalFirstName = data.firstName !== undefined ? data.firstName : (data.name ? data.name.split(' ')[0] : existingFirstName);
    const finalLastName = data.lastName !== undefined ? data.lastName : (data.name ? data.name.split(' ').slice(1).join(' ') : existingLastName);
    const fullName = `${finalFirstName} ${finalLastName}`.trim() || publicUser?.name || user.user_metadata?.name || 'Customer';

    const hasAddressInput =
      data.addressLine1 !== undefined ||
      data.addressLine2 !== undefined ||
      data.city !== undefined ||
      data.state !== undefined ||
      data.postalCode !== undefined ||
      data.country !== undefined ||
      data.address !== undefined;

    let finalAddress = publicUser?.address || '';
    if (hasAddressInput) {
      if (typeof data.address === 'string' && data.address.trim().length > 0) {
        finalAddress = data.address.trim();
      } else {
        let existingAddr: Record<string, string> = {};
        const oldAddr = publicUser?.address || '';
        if (oldAddr) {
          try {
            existingAddr = typeof oldAddr === 'string' && oldAddr.startsWith('{')
              ? JSON.parse(oldAddr)
              : { addressLine1: oldAddr };
          } catch {
            existingAddr = { addressLine1: oldAddr };
          }
        }

        const merged = {
          addressLine1: data.addressLine1 !== undefined ? data.addressLine1 : (existingAddr.addressLine1 || ''),
          addressLine2: data.addressLine2 !== undefined ? data.addressLine2 : (existingAddr.addressLine2 || ''),
          city: data.city !== undefined ? data.city : (existingAddr.city || ''),
          state: data.state !== undefined ? data.state : (existingAddr.state || ''),
          postalCode: data.postalCode !== undefined ? data.postalCode : (existingAddr.postalCode || ''),
          country: data.country !== undefined ? data.country : (existingAddr.country || 'Sri Lanka'),
        };
        finalAddress = JSON.stringify(merged);
      }
    }

    const payload: { name: string; phone?: string | null; address?: string } = {
      name: fullName,
    };
    if (data.phone !== undefined) {
      payload.phone = data.phone;
    }
    if (hasAddressInput) {
      payload.address = finalAddress;
    }

    // Update public.users table in Supabase
    const { error: userUpdateErr } = await supabase.from('users').update(payload).eq('id', user.id);
    if (userUpdateErr) {
      console.error('[updateUserProfilePageAction] users update failed:', userUpdateErr);
      return { success: false, error: 'Failed to update user profile.' };
    }

    // Also update public.customers table if exists
    const { error: customerUpdateErr } = await supabase.from('customers').update({
      name: fullName,
      phone: data.phone ?? publicUser?.phone ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    if (customerUpdateErr) {
      console.error('[updateUserProfilePageAction] customers update failed:', customerUpdateErr);
      return { success: false, error: 'Failed to update customer profile.' };
    }

    // Update Supabase Auth user metadata
    const { error: authMetaErr } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        name: fullName,
        phone: data.phone ?? user.user_metadata?.phone,
        address: finalAddress,
      },
    });

    if (authMetaErr) {
      console.error('[updateUserProfilePageAction] auth metadata update failed:', authMetaErr);
      return { success: false, error: 'Failed to update account metadata.' };
    }

    // Only update cookie AFTER all writes have successfully completed
    const cookieStore = await cookies();
    cookieStore.set('pb_auth_name', encodeURIComponent(fullName), {
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
    const supabase = getAdminSupabase();
    const { user } = await getAuthenticatedCustomerUser(supabase);
    
    if (!user) {
      return { success: false, orders: [], error: 'Not authenticated.' };
    }

    const userEmail = user.email || '';
    if (!userEmail) return { success: false, orders: [], error: 'User email not found.' };

    // Query orders from Supabase using parameter-safe separate equality lookups
    const [custRes, shipRes, uidRes] = await Promise.all([
      supabase.from('orders').select('*').eq('customer->>email', userEmail),
      supabase.from('orders').select('*').eq('shipping_address->>email', userEmail),
      supabase.from('orders').select('*').eq('customer->>userId', user.id),
    ]);

    if (custRes.error) throw custRes.error;
    if (shipRes.error) throw shipRes.error;
    if (uidRes.error) throw uidRes.error;

    // Deduplicate records by order id
    const orderMap = new Map<string, any>();
    for (const rec of [...(custRes.data || []), ...(shipRes.data || []), ...(uidRes.data || [])]) {
      if (rec && rec.id) {
        orderMap.set(rec.id, rec);
      }
    }

    const records = Array.from(orderMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const mappedOrders = records.map((row: any) => ({
      id: row.id,
      orderId: row.order_id,
      customer: row.customer || {},
      items: row.items || [],
      shippingAddress: row.shipping_address || {},
      paymentDetails: row.payment_details || {},
      subtotal: row.subtotal,
      shipping: row.shipping,
      tax: row.tax,
      total: row.total,
      status: row.status,
      isPaid: row.is_paid,
      paidAt: row.paid_at || undefined,
      isDelivered: row.is_delivered,
      deliveredAt: row.delivered_at || undefined,
      notes: row.notes || undefined,
      created: row.created_at,
      updated: row.updated_at,
      collectionId: "orders",
      collectionName: "orders",
    }));

    return { success: true, orders: mappedOrders };
  } catch (err: any) {
    console.error('[getCustomerOrdersAction] Failed:', err);
    return { success: false, orders: [], error: 'Failed to load orders.' };
  }
}

