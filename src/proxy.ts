import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { type AdminRole, ADMIN_ROLES } from '@/types/admin';
import { isValidSafeRedirect } from '@/lib/utils';
import { getAdminSupabase } from '@/lib/supabase-admin';

// ─── Route Permission Matrix ────────────────────────────────────────────────
// Defines which roles can access which admin routes.
// If a route is not listed, any authenticated admin can access it.

const ROUTE_PERMISSIONS: Record<string, AdminRole[]> = {
  '/admin/settings': ['super_admin', 'admin'],
  '/admin/users': ['super_admin', 'admin'],
  '/admin/audit-log': ['super_admin', 'admin', 'store_manager', 'read_only'],
  '/admin/promotions': ['super_admin', 'admin', 'store_manager'],
  '/admin/customers': ['super_admin', 'admin', 'store_manager', 'support_staff'],
  '/admin/orders': ['super_admin', 'admin', 'store_manager', 'support_staff'],
  '/admin/products': ['super_admin', 'admin', 'store_manager', 'content_editor'],
  '/admin/categories': ['super_admin', 'admin', 'store_manager', 'content_editor'],
  '/admin/brands': ['super_admin', 'admin', 'store_manager', 'content_editor'],
  '/admin/homepage': ['super_admin', 'admin', 'store_manager', 'content_editor'],
  '/admin/announcements': ['super_admin', 'admin', 'store_manager', 'content_editor'],
  '/admin/reviews': ['super_admin', 'admin', 'store_manager', 'content_editor', 'support_staff'],
  '/admin/media': ['super_admin', 'admin', 'store_manager', 'content_editor'],
  // Dashboard, inventory, sales, quotations are accessible by all authenticated admins
};

/**
 * Checks if the user's role has access to the requested admin route.
 */
function hasRouteAccess(pathname: string, role: AdminRole): boolean {
  // Find the most specific matching route with exact segment boundaries
  const matchingRoute = Object.keys(ROUTE_PERMISSIONS)
    .filter((route) => pathname === route || pathname.startsWith(route + '/'))
    .sort((a, b) => b.length - a.length)[0];

  // If no specific permission defined, allow any authenticated admin
  if (!matchingRoute) return true;

  return ROUTE_PERMISSIONS[matchingRoute].includes(role);
}

/**
 * Adds security headers to admin responses.
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection (for older browsers)
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy — restrict sensitive browser APIs on admin pages
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=()'
  );

  return response;
}

// ─── Warning for Missing Auth Cache Secret ──────────────────────────────────
let authCacheSecretWarned = false;
function getAuthCacheSecret(): string | undefined {
  const secret = process.env.AUTH_CACHE_SECRET;
  if (!secret && !authCacheSecretWarned) {
    authCacheSecretWarned = true;
    console.warn(
      '[AUTH_CACHE] AUTH_CACHE_SECRET environment variable is not set. Auth session caching is disabled, resulting in Supabase database lookups on every request.'
    );
  }
  return secret;
}

function clearAuthCookies(response: NextResponse): void {
  response.cookies.delete('pb_auth_token');
  response.cookies.delete('pb_auth_refresh_token');
  response.cookies.delete('pb_auth_role');
  response.cookies.delete('pb_auth_indicator');
  response.cookies.delete('pb_auth_name');
  response.cookies.delete('pb_auth_avatar');
  response.cookies.delete('pb_auth_cache');
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let token = request.cookies.get('pb_auth_token')?.value;
  const refreshToken = request.cookies.get('pb_auth_refresh_token')?.value;

  let refreshedSession: { accessToken: string; refreshToken?: string } | null = null;

  function attachAuthCookies(response: NextResponse): NextResponse {
    if (refreshedSession) {
      const secure = process.env.NODE_ENV === 'production';
      const base = {
        secure,
        sameSite: 'strict' as const,
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      };
      response.cookies.set('pb_auth_token', refreshedSession.accessToken, { ...base, httpOnly: true });
      if (refreshedSession.refreshToken) {
        response.cookies.set('pb_auth_refresh_token', refreshedSession.refreshToken, { ...base, httpOnly: true });
      }
    }
    return response;
  }

  // ── HMAC-signed validation cache ─────────────────────────────────────────
  // Stamp format written to pb_auth_cache: "<role>:<expirySeconds>:<hmac>"
  // where hmac = HMAC-SHA256(cacheSecret, role+":"+expiry+token).
  // This lets the middleware skip the DB round-trip for up to 60 s.
  async function stampCacheOnResponse(
    response: NextResponse,
    role: string,
    currentToken: string | undefined
  ): Promise<void> {
    const cacheSecret = getAuthCacheSecret();
    if (!cacheSecret || !currentToken) return;
    try {
      const expiry = Math.floor(Date.now() / 1000) + 60;
      const payload = `${role}:${expiry}`;
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(cacheSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload + currentToken));
      const mac = Buffer.from(sig).toString('hex');
      response.cookies.set('pb_auth_cache', `${role}:${expiry}:${mac}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60,
      });
    } catch {
      // Non-critical — cache miss on next request is fine
    }
  }

  async function verifyCache(currentToken: string | undefined): Promise<{ valid: boolean; role?: AdminRole | 'customer' }> {
    const cacheCookie = request.cookies.get('pb_auth_cache')?.value;
    const cacheSecret = getAuthCacheSecret();
    if (!cacheCookie || !cacheSecret || !currentToken) return { valid: false };

    try {
      const parts = cacheCookie.split(':');
      if (parts.length !== 3) return { valid: false };
      const [role, expiryStr, signature] = parts;
      const expiry = parseInt(expiryStr, 10);
      if (isNaN(expiry) || expiry < Math.floor(Date.now() / 1000)) return { valid: false };

      const payload = `${role}:${expiry}`;
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(cacheSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const expectedSig = Buffer.from(signature, 'hex');
      const isValid = await crypto.subtle.verify(
        'HMAC',
        key,
        expectedSig,
        new TextEncoder().encode(payload + currentToken)
      );

      if (isValid) {
        const validatedRole = (ADMIN_ROLES as readonly string[]).includes(role)
          ? (role as AdminRole)
          : 'customer';
        return { valid: true, role: validatedRole };
      }
    } catch {
      return { valid: false };
    }
    return { valid: false };
  }

  let hasValidToken = false;
  let resolvedRole: AdminRole | 'customer' = 'customer';
  let servedFromCache = false;

  // Only routes that actually need an auth decision pay the verification cost.
  const needsAuthCheck =
    pathname === '/account' ||
    pathname.startsWith('/account/') ||
    pathname.startsWith('/admin') ||
    pathname === '/auth';

  if (needsAuthCheck && (token || refreshToken)) {
    // 1. Check verified HMAC cache (only possible with existing access token)
    if (token) {
      const cacheCheck = await verifyCache(token);
      if (cacheCheck.valid && cacheCheck.role) {
        hasValidToken = true;
        resolvedRole = cacheCheck.role;
        servedFromCache = true;
      }
    }

    if (!servedFromCache) {
      // 2. Server-side Supabase token validation and DB role lookup
      try {
        const supabase = getAdminSupabase();
        let user = null;

        if (token) {
          const { data: userData, error: authErr } = await supabase.auth.getUser(token);
          if (!authErr && userData?.user) {
            user = userData.user;
          }
        }

        // If access token expired or invalid, attempt refresh using refresh_token
        if (!user && refreshToken) {
          try {
            const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession({
              refresh_token: refreshToken,
            });
            if (!refreshErr && refreshData?.session && refreshData?.user) {
              user = refreshData.user;
              token = refreshData.session.access_token;
              refreshedSession = {
                accessToken: refreshData.session.access_token,
                refreshToken: refreshData.session.refresh_token,
              };
            }
          } catch {
            // Refresh failed
          }
        }

        if (user) {
          hasValidToken = true;
          const { data: publicUser } = await supabase
            .from('users')
            .select('role, is_admin')
            .eq('id', user.id)
            .maybeSingle();

          const roleStr = publicUser?.role || user.user_metadata?.role;
          if (roleStr && (ADMIN_ROLES as readonly string[]).includes(roleStr)) {
            resolvedRole = roleStr as AdminRole;
          } else if (publicUser?.is_admin === true) {
            resolvedRole = 'super_admin';
          } else {
            resolvedRole = 'customer';
          }
        } else {
          hasValidToken = false;
          resolvedRole = 'customer';
        }
      } catch (err) {
        console.error('[proxy middleware] Auth verification error:', err);
        hasValidToken = false;
        resolvedRole = 'customer';
      }
    }
  }

  const isAdminUser = hasValidToken && (ADMIN_ROLES as readonly string[]).includes(resolvedRole);

  // ── Customer account route protection ──────────────────────────────────
  if (pathname === '/account' || pathname.startsWith('/account/')) {
    if (!hasValidToken) {
      // Auth is modal-only — send to home page where the modal can be opened
      const homeUrl = new URL('/', request.url);
      const redirectResponse = NextResponse.redirect(homeUrl);
      clearAuthCookies(redirectResponse);
      return redirectResponse;
    }
  }

  // ── Admin route protection ──────────────────────────────────────────────

  // 1. If trying to access protected admin pages without auth → redirect to /auth
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!isAdminUser) {
      const loginUrl = new URL('/auth', request.url);
      // Save original path to redirect back after login
      loginUrl.searchParams.set('redirect', pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      if (!hasValidToken) {
        clearAuthCookies(redirectResponse);
      }
      return redirectResponse;
    }

    // 2. Check role-based access - unconditionally enforce role check
    if (!hasRouteAccess(pathname, resolvedRole as AdminRole)) {
      // User is authenticated but doesn't have permission for this route
      const dashboardUrl = new URL('/admin/dashboard', request.url);
      dashboardUrl.searchParams.set('error', 'insufficient_permissions');
      const redirectResponse = NextResponse.redirect(dashboardUrl);
      return attachAuthCookies(redirectResponse);
    }

    // 3. Add security headers to admin responses
    const response = NextResponse.next();
    attachAuthCookies(response);
    if (!servedFromCache) await stampCacheOnResponse(response, resolvedRole, token);
    return addSecurityHeaders(response);
  }

  // 4. If already logged in and trying to visit login/auth page → redirect to requested destination or appropriate landing page
  if (pathname === '/admin/login' || pathname === '/auth') {
    if (hasValidToken) {
      const requested = request.nextUrl.searchParams.get('redirect');
      const safeRedirect = isValidSafeRedirect(requested) ? requested : null;
      if (safeRedirect && (isAdminUser || !safeRedirect.startsWith('/admin'))) {
        const redirectResponse = NextResponse.redirect(new URL(safeRedirect, request.url));
        return attachAuthCookies(redirectResponse);
      }
      if (isAdminUser) {
        const dashboardUrl = new URL('/admin/dashboard', request.url);
        const redirectResponse = NextResponse.redirect(dashboardUrl);
        return attachAuthCookies(redirectResponse);
      }
      const homeUrl = new URL('/', request.url);
      const redirectResponse = NextResponse.redirect(homeUrl);
      return attachAuthCookies(redirectResponse);
    }
    return addSecurityHeaders(NextResponse.next());
  }

  // ── Account route: allow through after successful auth ───────────────────
  if (hasValidToken && (pathname === '/account' || pathname.startsWith('/account/'))) {
    const response = NextResponse.next();
    attachAuthCookies(response);
    if (!servedFromCache) await stampCacheOnResponse(response, resolvedRole, token);
    return response;
  }

  return NextResponse.next();
}

export const middleware = proxy;
export default proxy;

export const config = {
  // Apply proxy to all admin and protected account routes
  matcher: ['/admin/:path*', '/account/:path*', '/account', '/auth'],
};
