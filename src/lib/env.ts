/**
 * Environment configuration helper.
 */

const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || '';

export const env = {
  get POCKETBASE_URL(): string {
    return pbUrl;
  },
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  REVALIDATION_SECRET: process.env.REVALIDATION_SECRET || '',
};

