import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getAdminSupabase } from '@/lib/supabase-admin';
import { isValidSafeRedirect } from '@/lib/utils';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const rawNext = requestUrl.searchParams.get('next') || '/';
  const next = isValidSafeRedirect(rawNext) ? rawNext : '/';

  const origin = requestUrl.origin;
  const redirectResponse = NextResponse.redirect(new URL(next, origin));

  if (!code) {
    return redirectResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            redirectResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data?.user) {
      console.error('[auth/callback] Code exchange failed:', error?.message);
      const errorUrl = new URL('/auth?error=auth_callback_failed', origin);
      return NextResponse.redirect(errorUrl);
    }

    const user = data.user;
    const userEmail = (user.email || '').toLowerCase().trim();

    // Perform safe server-side profile provisioning & legacy linking via admin client
    if (userEmail) {
      const adminSb = getAdminSupabase();

      // 1. Ensure public.profiles exists
      const { data: existingProfile } = await adminSb
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .maybeSingle();

      if (!existingProfile) {
        const displayName =
          user.user_metadata?.name ||
          user.user_metadata?.full_name ||
          userEmail.split('@')[0] ||
          'Customer';

        await adminSb.from('profiles').insert({
          id: user.id,
          name: displayName,
          role: 'customer', // Always non-admin on public registration
          avatar: user.user_metadata?.avatar_url || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      // 2. Legacy Customer Record Linking (Only link where profile_id IS NULL)
      const { data: unlinkedCustomer } = await adminSb
        .from('customers')
        .select('id, profile_id')
        .eq('email', userEmail)
        .is('profile_id', null)
        .maybeSingle();

      if (unlinkedCustomer) {
        // Link verified auth identity to legacy customer entity
        await adminSb
          .from('customers')
          .update({
            profile_id: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', unlinkedCustomer.id);
      } else {
        // Check if customer already exists for this profile_id
        const { data: profileCustomer } = await adminSb
          .from('customers')
          .select('id')
          .eq('profile_id', user.id)
          .maybeSingle();

        if (!profileCustomer) {
          const displayName =
            user.user_metadata?.name ||
            user.user_metadata?.full_name ||
            userEmail.split('@')[0] ||
            'Customer';

          await adminSb.from('customers').insert({
            profile_id: user.id,
            name: displayName,
            email: userEmail,
            orders_count: 0,
            total_spent: 0,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }

      // 3. Unambiguous legacy order backfill
      try {
        await adminSb
          .from('orders')
          .update({ user_id: user.id })
          .is('user_id', null)
          .eq('customer->>email', userEmail);
      } catch (orderErr) {
        console.warn('[auth/callback] Legacy order backfill non-fatal error:', orderErr);
      }

      // 4. Unambiguous legacy quotation backfill
      try {
        await adminSb
          .from('quotations')
          .update({ user_id: user.id })
          .is('user_id', null)
          .eq('customer_email', userEmail);
      } catch (quoteErr) {
        console.warn('[auth/callback] Legacy quotation backfill non-fatal error:', quoteErr);
      }
    }

    return redirectResponse;
  } catch (err) {
    console.error('[auth/callback] Unexpected error:', err);
    return NextResponse.redirect(new URL('/auth?error=unexpected', origin));
  }
}
