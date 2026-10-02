/**
 * Environment configuration helper.
 */

export const env = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  REVALIDATION_SECRET: process.env.REVALIDATION_SECRET || '',
};
