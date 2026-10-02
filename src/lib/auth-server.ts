import { cache } from 'react';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { getAdminSupabase } from '@/lib/supabase-admin';
import type { CustomerProfileData } from '@/app/actions/auth';

/**
 * Request-scoped deduplicated loader for the authenticated customer profile.
 * Multiple server components or layout callers in the SAME request render
 * will share the exact same resolution with ZERO redundant network queries.
 */
export const getCurrentUserSession = cache(async (): Promise<{
  success: boolean;
  user?: CustomerProfileData;
  error?: string;
}> => {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: 'Not authenticated.' };
    }

    // Query application profile with explicit required columns
    const adminSb = getAdminSupabase();
    const { data: profile } = await adminSb
      .from('profiles')
      .select('id, name, phone, address, role, avatar, created_at')
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
    console.error('[getCurrentUserSession] Error:', err);
    return { success: false, error: 'Failed to load user profile.' };
  }
});

/**
 * Request-scoped deduplicated loader for the authenticated customer orders.
 */
export const getCustomerOrders = cache(async (): Promise<{
  success: boolean;
  orders: any[];
  error?: string;
}> => {
  try {
    const supabase = await createServerSupabase();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, orders: [], error: 'Not authenticated.' };
    }

    // 1. Primary Query: authenticated user orders under RLS
    const { data: primaryOrders, error: primaryErr } = await supabase
      .from('orders')
      .select('id, order_id, customer_id, customer, items, shipping_address, payment_details, subtotal, shipping, tax, total, status, is_paid, paid_at, is_delivered, delivered_at, notes, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (primaryErr) {
      console.error('[getCustomerOrders] Query failed:', {
        message: primaryErr.message,
        code: primaryErr.code,
        details: primaryErr.details,
        hint: primaryErr.hint,
      });
      return { success: false, orders: [], error: 'Failed to load orders.' };
    }

    const orderMap = new Map<string, any>();
    (primaryOrders || []).forEach((o) => orderMap.set(o.id, o));

    // 2. Transitional Legacy Fallback: query by verified email only for unlinked historical orders
    if (user.email && user.email_confirmed_at) {
      const adminSb = getAdminSupabase();
      const { data: legacyOrders, error: legacyErr } = await adminSb
        .from('orders')
        .select('id, order_id, customer_id, customer, items, shipping_address, payment_details, subtotal, shipping, tax, total, status, is_paid, paid_at, is_delivered, delivered_at, notes, created_at, updated_at')
        .is('user_id', null)
        .eq('customer->>email', user.email.toLowerCase().trim());

      if (legacyErr) {
        console.warn('[getCustomerOrders] Legacy fallback lookup error:', {
          message: legacyErr.message,
          code: legacyErr.code,
        });
      } else if (legacyOrders) {
        legacyOrders.forEach((o) => {
          if (!orderMap.has(o.id)) {
            orderMap.set(o.id, o);
          }
        });
      }
    }

    const records = Array.from(orderMap.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const mappedOrders = records.map((row: any) => ({
      id: row.id,
      orderId: row.order_id || row.id,
      customer: row.customer || {},
      items: Array.isArray(row.items) ? row.items : [],
      shippingAddress: row.shipping_address || {},
      paymentDetails: row.payment_details || {},
      subtotal: typeof row.subtotal === 'number' ? row.subtotal : Number(row.subtotal || 0),
      shipping: typeof row.shipping === 'number' ? row.shipping : Number(row.shipping || 0),
      tax: typeof row.tax === 'number' ? row.tax : Number(row.tax || 0),
      total: typeof row.total === 'number' ? row.total : Number(row.total || 0),
      status: row.status || 'pending',
      isPaid: Boolean(row.is_paid),
      paidAt: row.paid_at || undefined,
      isDelivered: Boolean(row.is_delivered),
      deliveredAt: row.delivered_at || undefined,
      notes: row.notes || undefined,
      created: row.created_at,
      created_at: row.created_at,
      updated: row.updated_at,
      updated_at: row.updated_at,
      collectionId: 'orders',
      collectionName: 'orders',
    }));

    return { success: true, orders: mappedOrders };
  } catch (err: unknown) {
    const errorDetails = err instanceof Error ? { message: err.message, stack: err.stack } : err;
    console.error('[getCustomerOrders] Unexpected error:', errorDetails);
    return { success: false, orders: [], error: 'Failed to load orders.' };
  }
});
