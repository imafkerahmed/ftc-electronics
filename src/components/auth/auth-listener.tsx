'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { setOAuthSessionAction } from '@/app/actions/auth';

export function AuthListener() {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.access_token) {
        const loggedIn = /(?:^|;\s*)pb_auth_indicator=1(?:;|$)/.test(document.cookie);
        if (!loggedIn) {
          const res = await setOAuthSessionAction(session.access_token);
          if (res.success) {
            window.dispatchEvent(new Event('auth-change'));
          }
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
