import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getAdminSupabase } from '@/lib/supabase-admin';
import type { EmployeeRole } from '@/types/pos';

export const POS_COOKIE_NAME = 'ftc_pos_session';
export const POS_SESSION_MAX_AGE = 8 * 60 * 60; // 8 hours in seconds

export interface PosSessionPayload {
  employeeId: string;
  role: EmployeeRole;
  issuedAt: number;
  expiresAt: number;
  sessionId: string;
}

export interface VerifiedPosEmployee {
  employeeId: string;
  name: string;
  role: EmployeeRole;
}

function getPosSecret(): string {
  const secret = process.env.POS_SESSION_SECRET;
  if (!secret || secret.trim().length < 16) {
    throw new Error(
      '[POS Security] POS_SESSION_SECRET is missing or insufficiently strong in environment variables. Refusing to operate unencrypted.'
    );
  }
  return secret.trim();
}

/**
 * Creates an HMAC-SHA256 signature for the given payload string.
 */
function createSignature(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * Signs a POS session payload into a compact token: `<base64url(payload)>.<signature>`
 */
export function signPosSession(payload: PosSessionPayload): string {
  const secret = getPosSecret();
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createSignature(data, secret);
  return `${data}.${signature}`;
}

/**
 * Verifies a POS session token using constant-time comparison and checks expiry.
 */
export function verifyPosSessionToken(token: string): PosSessionPayload | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [data, signature] = parts;
    const secret = getPosSecret();
    const expectedSignature = createSignature(data, secret);

    const sigBuf = Buffer.from(signature, 'base64url');
    const expBuf = Buffer.from(expectedSignature, 'base64url');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payloadRaw = Buffer.from(data, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadRaw) as PosSessionPayload;

    if (!payload.employeeId || !payload.expiresAt || !payload.role) {
      return null;
    }

    // Check expiry
    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Sets the HttpOnly, SameSite=Lax signed session cookie in the Next.js response.
 */
export async function setPosSessionCookie(payload: PosSessionPayload): Promise<void> {
  const token = signPosSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(POS_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: POS_SESSION_MAX_AGE,
  });
}

/**
 * Clears the POS session cookie.
 */
export async function clearPosSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(POS_COOKIE_NAME);
}

/**
 * Reusable server-only validator for POS operations.
 * 1. Reads the HttpOnly cookie.
 * 2. Cryptographically validates signature and expiry.
 * 3. Authoritatively confirms employee is still active and valid in the DB.
 * 4. Returns authoritative employee details or null.
 */
export async function getVerifiedPosSession(): Promise<VerifiedPosEmployee | null> {
  if (typeof window !== 'undefined') {
    throw new Error('getVerifiedPosSession is a server-only security function.');
  }

  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(POS_COOKIE_NAME);
    if (!cookie?.value) return null;

    const payload = verifyPosSessionToken(cookie.value);
    if (!payload) return null;

    // Resolve authoritative status directly from database
    const supabase = getAdminSupabase();
    const { data: employee, error } = await supabase
      .from('employees')
      .select('id, name, role, is_active')
      .eq('id', payload.employeeId)
      .maybeSingle();

    if (error || !employee || employee.is_active === false) {
      return null;
    }

    const authoritativeRole: EmployeeRole =
      employee.role === 'manager' ? 'manager' : 'cashier';

    return {
      employeeId: employee.id,
      name: employee.name || 'Staff Cashier',
      role: authoritativeRole,
    };
  } catch (err: any) {
    if (!err?.message?.includes('outside a request scope')) {
      console.error('[getVerifiedPosSession] Session verification error:', err);
    }
    return null;
  }
}
