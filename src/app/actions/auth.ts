'use server';

import { cookies, headers } from 'next/headers';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase, writeAuditLog } from '@/lib/supabase-admin';
import { getTrustedClientIp } from '@/lib/get-client-ip';
import { type AdminRole, ADMIN_ROLES } from '@/types/admin';
import type { User } from '@supabase/supabase-js';

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

const DEFAULT_RATE_LIMIT: RateLimitConfig = { maxAttempts: 5, windowMs: 15 * 60 * 1000 };

const globalForAuthStores = globalThis as unknown as {
  __rateLimitStore?: Map<string, { count: number; lastAttempt: number; action: string }>;
};

const rateLimitStore = globalForAuthStores.__rateLimitStore ??= new Map<string, { count: number; lastAttempt: number; action: string }>();

function cleanupExpiredRateLimits(): void {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    const config = ACTION_RATE_LIMITS[record.action] ?? DEFAULT_RATE_LIMIT;
    if (now - record.lastAttempt > config.windowMs) {
      rateLimitStore.delete(key);
    }
  }

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

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface AuthActionResult {
  success: boolean;
  error?: string;
  message?: string;
  role?: AdminRole | 'customer';
  requiresConfirmation?: boolean;
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

// ─── Login Action ─────────────────────────────────────────────────────────────

/**
 * Server action to log in a user/admin using Supabase SSR Auth.
 * Verified role is derived exclusively from public.profiles on the server.
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

  try {
    const supabase = await createServerSupabase();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData?.user) {
      recordAuthAttempt(ip, 'login');
      writeAuditLog(email, 'login', 'auth', undefined, undefined, { success: false, ip }, { ip, userAgent });
      return { success: false, error: 'Invalid email or password.' };
    }

    clearAuthAttempts(ip, 'login');

    const user = authData.user;
    const adminSb = getAdminSupabase();

    // 2. Fetch role & application identity strictly from public.profiles
    const { data: profile } = await adminSb
      .from('profiles')
      .select('id, role, name')
      .eq('id', user.id)
      .maybeSingle();

    let userRole: AdminRole | 'customer' = 'customer';
    const profileRole = profile?.role;
    if (profileRole && (ADMIN_ROLES as readonly string[]).includes(profileRole)) {
      userRole = profileRole as AdminRole;
    }

    // 3. If profile row is missing, provision it now as customer
    if (!profile) {
      const displayName = user.user_metadata?.name || email.split('@')[0] || 'Customer';
      await adminSb.from('profiles').insert({
        id: user.id,
        name: displayName,
        role: 'customer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    // 4. If legacy customer record exists unlinked, link it safely
    if (user.email_confirmed_at) {
      await adminSb
        .from('customers')
        .update({ profile_id: user.id, updated_at: new Date().toISOString() })
        .eq('email', email)
        .is('profile_id', null);
    }

    writeAuditLog(
      email,
      'login',
      'auth',
      user.id,
      undefined,
      { role: userRole, ip },
      { ip, userAgent }
    );

    return { success: true, role: userRole };
  } catch (err) {
    console.error('[loginAction] Unexpected error:', err);
    recordAuthAttempt(ip, 'login');
    return { success: false, error: 'Unable to sign in. Please try again later.' };
  }
}

// ─── Sign Up Action ───────────────────────────────────────────────────────────

/**
 * Server action to register a new user account with native Supabase Auth.
 * Passwords are never temporarily stored or encrypted by the application.
 */
export async function signUpAction(formData: FormData): Promise<AuthActionResult> {
  const name = (formData.get('name') as string || '').trim();
  const email = (formData.get('email') as string || '').trim().toLowerCase();
  const password = formData.get('password') as string || '';
  const confirmPassword = formData.get('confirmPassword') as string || '';

  if (!email || !email.includes('@')) {
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
    const supabase = await createServerSupabase();
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email.split('@')[0],
        },
        emailRedirectTo: `${origin}/auth/callback?next=/account/profile`,
      },
    });

    if (authError) {
      recordAuthAttempt(ip, 'signup');
      return { success: false, error: authError.message || 'Failed to create account.' };
    }

    clearAuthAttempts(ip, 'signup');

    // If email confirmation is disabled or user is already confirmed
    if (authData?.user && authData.user.email_confirmed_at) {
      const adminSb = getAdminSupabase();
      await adminSb.from('profiles').upsert({
        id: authData.user.id,
        name: name || email.split('@')[0],
        role: 'customer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Link legacy unlinked customer record
      await adminSb
        .from('customers')
        .update({ profile_id: authData.user.id, updated_at: new Date().toISOString() })
        .eq('email', email)
        .is('profile_id', null);

      writeAuditLog(email, 'create', 'profiles', authData.user.id, undefined, { email, role: 'customer' }, { ip, userAgent });
      return { success: true, message: 'Account created successfully!' };
    }

    return {
      success: true,
      requiresConfirmation: true,
      message: 'A confirmation link has been sent to your email. Please check your inbox to activate your account.',
    };
  } catch (err) {
    console.error('[signUpAction] Error:', err);
    recordAuthAttempt(ip, 'signup');
    return { success: false, error: 'Unable to complete registration right now. Please try again.' };
  }
}

// ─── Legacy Customer Activation ───────────────────────────────────────────────

/**
 * Initiates activation for an existing legacy customer record without requiring password guessing.
 * Uses native Supabase Auth signup or invite flow through the secure server boundary.
 */
export async function requestLegacyCustomerActivationAction(email: string): Promise<AuthActionResult> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Valid email is required.' };
  }

  const headersList = await headers();
  const ip = getTrustedClientIp(headersList);
  const rateCheck = checkAuthRateLimit(ip, 'signup');
  if (!rateCheck.allowed) {
    return { success: false, error: 'Too many requests. Please try again later.' };
  }

  recordAuthAttempt(ip, 'signup');

  // Generic OWASP response to prevent email enumeration
  const uniformResponse: AuthActionResult = {
    success: true,
    message: 'If an account matching that email address exists, an activation link has been sent to your email.',
  };

  try {
    const adminSb = getAdminSupabase();
    const { data: customer } = await adminSb
      .from('customers')
      .select('id, name, email, profile_id')
      .eq('email', cleanEmail)
      .is('profile_id', null)
      .maybeSingle();

    if (!customer) {
      return uniformResponse;
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    // Generate secure activation / invite link
    const { error: inviteErr } = await adminSb.auth.admin.inviteUserByEmail(cleanEmail, {
      data: { name: customer.name },
      redirectTo: `${origin}/auth/callback?next=/account/profile`,
    });

    if (inviteErr) {
      console.warn('[requestLegacyCustomerActivationAction] Invite notice:', inviteErr.message);
    }

    return uniformResponse;
  } catch (err) {
    console.error('[requestLegacyCustomerActivationAction] Error:', err);
    return uniformResponse;
  }
}

// ─── Forgot Password Action ───────────────────────────────────────────────────

/**
 * Initiates native Supabase password recovery.
 */
export async function forgotPasswordAction(formData: FormData): Promise<AuthActionResult> {
  const email = (formData.get('email') as string || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
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

  recordAuthAttempt(ip, 'forgotPassword');

  const uniformResponse: AuthActionResult = {
    success: true,
    message: 'If an account matching that email address exists, a password reset link has been sent to your email.',
  };

  try {
    const supabase = await createServerSupabase();
    const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });

    return uniformResponse;
  } catch (err) {
    console.error('[forgotPasswordAction] Error:', err);
    return uniformResponse;
  }
}

// ─── Reset Password Action ────────────────────────────────────────────────────

/**
 * Updates the user's password using native Supabase Auth within the verified recovery context.
 * Does NOT use service-role admin APIs for normal user password resets.
 */
export async function resetPasswordAction(formData: FormData): Promise<AuthActionResult> {
  const password = formData.get('password') as string || '';
  const confirmPassword = formData.get('confirmPassword') as string || '';

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

  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user) {
      recordAuthAttempt(ip, 'resetPassword');
      return { success: false, error: 'Password reset session expired or invalid. Please request a new link.' };
    }

    const { error: updateErr } = await supabase.auth.updateUser({
      password,
    });

    if (updateErr) {
      recordAuthAttempt(ip, 'resetPassword');
      return { success: false, error: updateErr.message || 'Failed to update password.' };
    }

    clearAuthAttempts(ip, 'resetPassword');
    writeAuditLog(user.email || 'user', 'update', 'profiles', user.id, undefined, { action: 'password_reset_success' }, { ip });

    return {
      success: true,
      message: 'Your password has been successfully updated. You may now continue using your account.',
    };
  } catch (err) {
    console.error('[resetPasswordAction] Error:', err);
    recordAuthAttempt(ip, 'resetPassword');
    return { success: false, error: 'Unable to reset your password right now. Please try again.' };
  }
}

// ─── Logout Action ────────────────────────────────────────────────────────────

/**
 * Logs out the current user via Supabase Auth and cleans up legacy cookie artifacts.
 */
export async function logoutAction(): Promise<{ success: boolean }> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.auth.signOut();

    const cookieStore = await cookies();
    const legacyCookies = [
      'pb_auth_token',
      'pb_auth_refresh_token',
      'pb_auth_role',
      'pb_auth_indicator',
      'pb_auth_name',
      'pb_auth_avatar',
      'pb_auth_cache',
    ];
    legacyCookies.forEach((name) => cookieStore.delete(name));

    if (user?.email) {
      writeAuditLog(user.email, 'logout', 'auth', user.id);
    }

    return { success: true };
  } catch (err) {
    console.error('[logoutAction] Error:', err);
    return { success: true };
  }
}

// ─── Customer Session & Profile ───────────────────────────────────────────────

/**
 * Retrieves the currently authenticated customer profile from the Supabase SSR session.
 */
export async function getCurrentUserSessionAction(): Promise<{
  success: boolean;
  user?: CustomerProfileData;
  error?: string;
}> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: 'Not authenticated.' };
    }

    // Query application profile from public.profiles
    const adminSb = getAdminSupabase();
    const { data: profile } = await adminSb
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    const fullName = profile?.name || user.user_metadata?.name || user.email?.split('@')[0] || 'Customer';
    const nameParts = fullName.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const phone = profile?.phone || user.user_metadata?.phone || '';
    const address = profile?.address || user.user_metadata?.address || '';

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
        addressLine1 = address;
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
        role: profile?.role || 'customer',
        created: profile?.created_at || user.created_at || new Date().toISOString(),
        avatar: profile?.avatar || undefined,
      },
    };
  } catch (err) {
    console.error('[getCurrentUserSessionAction] error:', err);
    return { success: false, error: 'Failed to load user profile.' };
  }
}

/**
 * Updates the current logged-in customer's profile details.
 * Strictly updates safe user-editable fields (name, phone, address, avatar).
 * Sensitive security fields (role, pin, id) are NEVER modifiable through this action.
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
  avatar?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: 'Not authenticated.' };
    }

    const adminSb = getAdminSupabase();
    const { data: currentProfile } = await adminSb
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    const existingNameParts = ((currentProfile?.name || user.user_metadata?.name || '').trim()).split(' ');
    const existingFirstName = existingNameParts[0] || '';
    const existingLastName = existingNameParts.slice(1).join(' ') || '';

    const finalFirstName = data.firstName !== undefined ? data.firstName : (data.name ? data.name.split(' ')[0] : existingFirstName);
    const finalLastName = data.lastName !== undefined ? data.lastName : (data.name ? data.name.split(' ').slice(1).join(' ') : existingLastName);
    const fullName = `${finalFirstName} ${finalLastName}`.trim() || currentProfile?.name || user.user_metadata?.name || 'Customer';

    const hasAddressInput =
      data.addressLine1 !== undefined ||
      data.addressLine2 !== undefined ||
      data.city !== undefined ||
      data.state !== undefined ||
      data.postalCode !== undefined ||
      data.country !== undefined ||
      data.address !== undefined;

    let finalAddress = currentProfile?.address || '';
    if (hasAddressInput) {
      if (typeof data.address === 'string' && data.address.trim().length > 0) {
        finalAddress = data.address.trim();
      } else {
        let existingAddr: Record<string, string> = {};
        const oldAddr = currentProfile?.address || '';
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

    // Explicit safe payload: NO role, NO pin, NO id
    const safePayload: { name: string; phone?: string | null; address?: string; avatar?: string | null; updated_at: string } = {
      name: fullName,
      updated_at: new Date().toISOString(),
    };
    if (data.phone !== undefined) safePayload.phone = data.phone;
    if (hasAddressInput) safePayload.address = finalAddress;
    if (data.avatar !== undefined) safePayload.avatar = data.avatar;

    // Update public.profiles table
    const { error: profileErr } = await adminSb
      .from('profiles')
      .upsert({ id: user.id, ...safePayload });

    if (profileErr) {
      console.error('[updateUserProfilePageAction] profiles update failed:', profileErr);
      return { success: false, error: 'Failed to update profile.' };
    }

    // Sync name and phone to public.customers CRM entity if linked
    await adminSb
      .from('customers')
      .update({
        name: fullName,
        phone: data.phone ?? currentProfile?.phone ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('profile_id', user.id);

    return { success: true };
  } catch (err) {
    console.error('[updateUserProfilePageAction] Unexpected error:', err);
    return { success: false, error: 'Failed to update profile.' };
  }
}

// ─── Customer Orders Action ───────────────────────────────────────────────────

/**
 * Fetches orders belonging to the authenticated customer.
 * Primary ownership is enforced by orders.user_id = auth.uid().
 * Transitional fallback retrieves legacy unlinked orders by verified email.
 */
export async function getCustomerOrdersAction(): Promise<{
  success: boolean;
  orders: any[];
  error?: string;
}> {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, orders: [], error: 'Not authenticated.' };
    }

    const adminSb = getAdminSupabase();

    // 1. Primary Query: immutable ownership via user_id
    const { data: primaryOrders, error: primaryErr } = await adminSb
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (primaryErr) throw primaryErr;

    const orderMap = new Map<string, any>();
    (primaryOrders || []).forEach((o) => orderMap.set(o.id, o));

    // 2. Transitional Legacy Fallback: query by verified email only for unlinked historical orders
    if (user.email && user.email_confirmed_at) {
      const { data: legacyOrders } = await adminSb
        .from('orders')
        .select('*')
        .is('user_id', null)
        .eq('customer->>email', user.email.toLowerCase().trim());

      (legacyOrders || []).forEach((o) => {
        if (!orderMap.has(o.id)) {
          orderMap.set(o.id, o);
        }
      });
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
      collectionId: 'orders',
      collectionName: 'orders',
    }));

    return { success: true, orders: mappedOrders };
  } catch (err) {
    console.error('[getCustomerOrdersAction] Failed:', err);
    return { success: false, orders: [], error: 'Failed to load orders.' };
  }
}
