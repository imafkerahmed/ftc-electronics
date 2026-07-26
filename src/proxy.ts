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
 * Safely decodes base64url JSON payload with proper padding.
 */
function decodeJwtPayload(payloadPart: string): any {
  const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const decoded = atob(padded);
  return JSON.parse(decoded);
}

/**
 * Checks if a JWT token is expired without making any network requests.
 * Uses Edge-runtime friendly atob for base64url decoding.
 */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;

    const payload = decodeJwtPayload(parts[1]);
    const exp = payload.exp;
    if (!exp) return true;

    // exp is in seconds, Date.now() is in milliseconds
    return Date.now() >= exp * 1000;
  } catch {
    return true;
  }
}

/**
 * Safely decodes and extracts the user role from a JWT token's payload in Edge runtime.
 */
function extractRoleFromTokenPayload(token: string): AdminRole | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = decodeJwtPayload(parts[1]);

    const role = payload.role || payload.record?.role;
    if (role === 'admin' || role === 'super_admin') return 'super_admin';

    if (role && (ADMIN_ROLES as readonly string[]).includes(role)) {
      return role as AdminRole;
    }

    if (payload.isAdmin === true || payload.is_admin === true || payload.record?.isAdmin === true || payload.record?.is_admin === true) {
      return 'super_admin';
    }
  } catch {
    // Ignore error
  }
  return null;
}

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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('pb_auth_token')?.value;

  const hasValidToken = Boolean(token && !isTokenExpired(token));

  // Extract role strictly from JWT token payload
  const jwtRole = token ? extractRoleFromTokenPayload(token) : null;

  // Resolve role: strictly derive from JWT payload. Never trust client-controlled cookies. Default to 'read_only' (minimum privilege).
  const resolvedRole: AdminRole = jwtRole || 'read_only';

  // ── Customer account route protection ──────────────────────────────────
  if (pathname.startsWith('/account')) {
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
    if (!hasValidToken) {
      const loginUrl = new URL('/admin/login', request.url);
      // Save original path to redirect back after login
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // 2. Check role-based access - unconditionally enforce role check
    if (!hasRouteAccess(pathname, resolvedRole)) {
      // User is authenticated but doesn't have permission for this route
      const dashboardUrl = new URL('/admin/dashboard', request.url);
      dashboardUrl.searchParams.set('error', 'insufficient_permissions');
      return NextResponse.redirect(dashboardUrl);
    }

    // 3. Add security headers to admin responses
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }

  // 4. If already logged in and trying to visit login page → redirect to dashboard
  if (pathname === '/admin/login') {
    if (hasValidToken) {
      const dashboardUrl = new URL('/admin/dashboard', request.url);
      return NextResponse.redirect(dashboardUrl);
    }
    return addSecurityHeaders(NextResponse.next());
  }

  return NextResponse.next();
}

export const middleware = proxy;
export default proxy;

export const config = {
  // Apply proxy to all admin routes
  matcher: ['/admin/:path*'],
};
