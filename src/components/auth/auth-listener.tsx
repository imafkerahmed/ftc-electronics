'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

export function AuthListener() {
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        window.dispatchEvent(new Event('auth-change'));
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
