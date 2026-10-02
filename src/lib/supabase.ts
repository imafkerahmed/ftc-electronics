import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    `Supabase configuration error: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. ` +
    `Found URL: ${supabaseUrl ? "Present" : "Missing"}, Anon Key: ${supabaseAnonKey ? "Present" : "Missing"}`
  );
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Builds a public CDN/storage URL for an asset.
 */
export function getSupabaseFileUrl(bucket: string, path?: string | null): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

export function isUserAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return false;
}
