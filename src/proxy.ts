import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { type AdminRole, ADMIN_ROLES } from '@/types/admin';

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('pb_auth_token')?.value;

  // ── HMAC-signed validation cache ─────────────────────────────────────────
  // Stamp format written to pb_auth_cache: "<role>:<expirySeconds>:<hmac>"
  // where hmac = HMAC-SHA256(cacheSecret, role+":"+expiry+token).
  // This lets the middleware skip the PB round-trip for up to 60 s.
  async function stampCacheOnResponse(
    response: NextResponse,
    role: string,
  ): Promise<void> {
    const cacheSecret = process.env.AUTH_CACHE_SECRET;
    if (!cacheSecret || !token) return;
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
      const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload + token));
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

  const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL;
  let hasValidToken = false;
  let resolvedRole: AdminRole | 'customer' = 'customer';
  let servedFromCache = false;

  // Only routes that actually need an auth decision pay the PB round-trip.
  const needsAuthCheck =
    pathname === '/account' ||
    pathname.startsWith('/account/') ||
    pathname.startsWith('/admin');

  if (needsAuthCheck && token && pbUrl) {
    // ── Short-lived validation cache (60 s) ───────────────────────────────
    // The Edge runtime has no shared memory, so we store a HMAC-signed stamp
    // in a cookie to skip repeated PocketBase calls on fast client navigations.
    // The stamp is "<tokenHash>.<expiryEpochSeconds>" signed with AUTH_CACHE_SECRET.
    const cacheSecret = process.env.AUTH_CACHE_SECRET;
    const cacheStamp = request.cookies.get('pb_auth_cache')?.value;

    if (cacheSecret && cacheStamp) {
      try {
        // stamp format: <role>:<expiry>:<hmac>
        const parts = cacheStamp.split(':');
        if (parts.length === 3) {
          const [cachedRole, expiry, mac] = parts;
          const payload = `${cachedRole}:${expiry}`;
          const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(cacheSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
          );
          const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload + token));
          const expected = Buffer.from(sig).toString('hex');
          if (expected === mac && Number(expiry) > Date.now() / 1000) {
            hasValidToken = true;
            resolvedRole = (ADMIN_ROLES as readonly string[]).includes(cachedRole)
              ? (cachedRole as AdminRole)
              : 'customer';
            servedFromCache = true;
          }
        }
      } catch {
        // Cache miss / tampered — fall through to live PB check
      }
    }

    if (!servedFromCache) {
      try {
        // Validate the token cryptographically against the PocketBase server.
        // AbortSignal.timeout(3000) ensures a slow/unreachable PB degrades to
        // the fail-secure branch instead of blocking the whole route.
        const authRefreshRes = await fetch(`${pbUrl}/api/collections/users/auth-refresh`, {
          method: 'POST',
          headers: {
            'Authorization': token,
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(3000),
        });

        if (authRefreshRes.ok) {
          const data = await authRefreshRes.json();
          const record = data.record;

          if (record) {
            hasValidToken = true;
            let role = record.role as string | undefined;
            if (role === 'admin') {
              role = 'super_admin';
            }

            if (role && (ADMIN_ROLES as readonly string[]).includes(role)) {
              resolvedRole = role as AdminRole;
            } else if (record.isAdmin === true || record.is_admin === true) {
              resolvedRole = 'super_admin';
            } else {
              resolvedRole = 'customer';
            }
          }
        }
      } catch {
        // Fail secure - token remains unverified
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
      // Clear stale client-readable indicator and user details so the navbar knows the user is logged out
      redirectResponse.cookies.delete('pb_auth_indicator');
      redirectResponse.cookies.delete('pb_auth_name');
      redirectResponse.cookies.delete('pb_auth_avatar');
      return redirectResponse;
    }
  }

  // ── Admin route protection ──────────────────────────────────────────────

  // 1. If trying to access protected admin pages without auth → redirect to login
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!isAdminUser) {
      const loginUrl = new URL('/admin/login', request.url);
      // Save original path to redirect back after login
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // 2. Check role-based access - unconditionally enforce role check
    if (!hasRouteAccess(pathname, resolvedRole as AdminRole)) {
      // User is authenticated but doesn't have permission for this route
      const dashboardUrl = new URL('/admin/dashboard', request.url);
      dashboardUrl.searchParams.set('error', 'insufficient_permissions');
      return NextResponse.redirect(dashboardUrl);
    }

    // 3. Add security headers to admin responses
    const response = NextResponse.next();
    if (!servedFromCache) await stampCacheOnResponse(response, resolvedRole);
    return addSecurityHeaders(response);
  }

  // 4. If already logged in and trying to visit login page → redirect to dashboard
  if (pathname === '/admin/login') {
    if (isAdminUser) {
      const dashboardUrl = new URL('/admin/dashboard', request.url);
      return NextResponse.redirect(dashboardUrl);
    }
    return addSecurityHeaders(NextResponse.next());
  }

  // ── Account route: allow through after successful auth ───────────────────
  if (hasValidToken && (pathname === '/account' || pathname.startsWith('/account/'))) {
    const response = NextResponse.next();
    if (!servedFromCache) await stampCacheOnResponse(response, resolvedRole);
    return response;
  }

  return NextResponse.next();
}

export const middleware = proxy;
export default proxy;

export const config = {
  // Apply proxy to all admin routes
  matcher: ['/admin/:path*'],
};
