import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { type AdminRole, ADMIN_ROLES } from '@/types/admin';
import { isValidSafeRedirect } from '@/lib/utils';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { updateSession } from '@/lib/supabase/middleware';

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
  const matchingRoute = Object.keys(ROUTE_PERMISSIONS)
    .filter((route) => pathname === route || pathname.startsWith(route + '/'))
    .sort((a, b) => b.length - a.length)[0];

  if (!matchingRoute) return true;

  return ROUTE_PERMISSIONS[matchingRoute].includes(role);
}

/**
 * Adds security headers to admin responses.
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=()'
  );
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Refresh Supabase SSR session tokens
  const { supabaseResponse, user } = await updateSession(request);
  const hasValidSession = Boolean(user);

  // ── Customer account route protection ──────────────────────────────────────
  // Customer routes only require a valid session; avoid querying profiles.role over the network.
  if (pathname === '/account' || pathname.startsWith('/account/')) {
    if (!hasValidSession) {
      const homeUrl = new URL('/', request.url);
      return NextResponse.redirect(homeUrl);
    }
    return addSecurityHeaders(supabaseResponse);
  }

  // ── Role resolution (Only executed when accessing /admin or /auth) ──────────
  let resolvedRole: AdminRole | 'customer' = 'customer';
  let isAdminUser = false;
  const requiresAdminCheck = pathname.startsWith('/admin') || pathname === '/auth';

  if (user && requiresAdminCheck) {
    try {
      const adminSb = getAdminSupabase();
      const { data: profile } = await adminSb
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const roleStr = profile?.role;
      if (roleStr && (ADMIN_ROLES as readonly string[]).includes(roleStr)) {
        resolvedRole = roleStr as AdminRole;
        isAdminUser = true;
      }
    } catch {
      resolvedRole = 'customer';
      isAdminUser = false;
    }
  }

  // ── Admin route protection ──────────────────────────────────────────────────
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!isAdminUser) {
      const loginUrl = new URL('/auth', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (!hasRouteAccess(pathname, resolvedRole as AdminRole)) {
      const dashboardUrl = new URL('/admin/dashboard', request.url);
      dashboardUrl.searchParams.set('error', 'insufficient_permissions');
      return NextResponse.redirect(dashboardUrl);
    }

    return addSecurityHeaders(supabaseResponse);
  }

  // ── Auth route (already logged in redirect) ──────────────────────────────────
  if (pathname === '/admin/login' || pathname === '/auth') {
    if (hasValidSession) {
      const requested = request.nextUrl.searchParams.get('redirect');
      const safeRedirect = isValidSafeRedirect(requested) ? requested : null;
      if (safeRedirect && (isAdminUser || !safeRedirect.startsWith('/admin'))) {
        return NextResponse.redirect(new URL(safeRedirect, request.url));
      }
      if (isAdminUser) {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
      return NextResponse.redirect(new URL('/', request.url));
    }
    return addSecurityHeaders(supabaseResponse);
  }

  return supabaseResponse;
}

export const middleware = proxy;
export default proxy;

export const config = {
  // Apply proxy to all admin, auth, and protected account routes
  matcher: ['/admin/:path*', '/account/:path*', '/account', '/auth'],
};
