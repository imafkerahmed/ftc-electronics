/**
 * Server-side Supabase admin client.
 * 
 * Provides an administrative Supabase client instance powered by 
 * SUPABASE_SERVICE_ROLE_KEY for server actions, API routes, and admin operations.
 * Includes a full compatibility layer for legacy SDK calls.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { AuditAction } from '@/types/admin';

let adminSupabaseClient: SupabaseClient | null = null;

export function getAdminSupabase(): SupabaseClient {
  if (adminSupabaseClient) return adminSupabaseClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('[supabase-admin] NEXT_PUBLIC_SUPABASE_URL is not set.');
  }

  if (!serviceRoleKey) {
    throw new Error('[supabase-admin] SUPABASE_SERVICE_ROLE_KEY is not set.');
  }

  adminSupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return adminSupabaseClient;
}

/**
 * Strips HTML from error messages (e.g. Cloudflare 530 pages returned as error.message).
 * Extracts the <title> if present, otherwise returns a generic truncation notice.
 */
function cleanErrorMessage(msg: string | undefined | null): string {
  if (!msg) return '(no message)';
  if (typeof msg === 'string' && (msg.includes('<!doctype html>') || msg.includes('<html'))) {
    const match = msg.match(/<title>([^<]+)<\/title>/i);
    const title = match ? match[1].trim() : 'HTML Error';
    return `${title} (HTML response body truncated)`;
  }
  return msg;
}

export interface AdminCollectionFacade<T = Record<string, unknown>> {
  getFullList: (opts?: { sort?: string }) => Promise<T[]>;
  getList: (page?: number, perPage?: number, opts?: { sort?: string }) => Promise<{ items: T[]; totalItems: number; totalPages: number }>;
  getOne: (id: string) => Promise<T>;
  getFirstListItem: (filterStr?: string) => Promise<T>;
  create: (payload: Partial<T> | Record<string, unknown>) => Promise<T>;
  update: (id: string, payload: Partial<T> | Record<string, unknown>) => Promise<T>;
  delete: (id: string) => Promise<boolean>;
}

export function getAdminPb(): {
  supabase: SupabaseClient;
  collection: <T = Record<string, unknown>>(table: string) => AdminCollectionFacade<T>;
  filter: (str: string, params?: Record<string, unknown>) => never;
} {
  const client = getAdminSupabase();

  return {
    supabase: client,
    collection: <T = Record<string, unknown>>(table: string): AdminCollectionFacade<T> => ({
      getFullList: async (opts?: { sort?: string }) => {
        let q = client.from(table).select('*');
        if (opts?.sort) {
          const desc = opts.sort.startsWith('-');
          let col = desc ? opts.sort.slice(1) : opts.sort;
          if (col === 'created') col = 'created_at';
          if (col === 'updated') col = 'updated_at';
          q = q.order(col, { ascending: !desc });
        }
        const { data, error } = await q;
        if (error) {
          console.warn(`[supabase-admin] getFullList error for ${table}: ${cleanErrorMessage(error.message)}`);
          return [];
        }
        return (data || []) as unknown as T[];
      },
      getList: async (page = 1, perPage = 50, opts?: { sort?: string }) => {
        const from = (page - 1) * perPage;
        const to = from + perPage - 1;
        let q = client.from(table).select('*', { count: 'exact' });
        if (opts?.sort) {
          const desc = opts.sort.startsWith('-');
          let col = desc ? opts.sort.slice(1) : opts.sort;
          if (col === 'created') col = 'created_at';
          q = q.order(col, { ascending: !desc });
        }
        const { data, count, error } = await q.range(from, to);
        if (error) {
          console.warn(`[supabase-admin] getList error for ${table}: ${cleanErrorMessage(error.message)}`);
        }
        return {
          items: (data || []) as unknown as T[],
          totalItems: count || 0,
          totalPages: Math.ceil((count || 0) / perPage),
        };
      },
      getOne: async (id: string): Promise<T> => {
        const { data, error } = await client.from(table).select('*').eq('id', id).maybeSingle();
        if (error || !data) throw new Error(`Record ${id} not found in ${table}`);
        return data as unknown as T;
      },
      getFirstListItem: async (filterStr?: string): Promise<T> => {
        let q = client.from(table).select('*');
        if (filterStr) {
          const eqMatch = filterStr.match(/(\w+)\s*=\s*"([^"]+)"/);
          if (eqMatch) {
            const field = eqMatch[1] === 'orderId' ? 'order_id' : eqMatch[1];
            q = q.eq(field, eqMatch[2]);
          } else {
            throw new Error(`[supabase-admin] Unsupported filter format in getFirstListItem: "${filterStr}". Use native Supabase client instead.`);
          }
        }
        const { data, error } = await q.limit(1).maybeSingle();
        if (error || !data) throw new Error(`Record not found in ${table}`);
        return data as unknown as T;
      },
      create: async (payload: Partial<T> | Record<string, unknown>): Promise<T> => {
        const cleanPayload = typeof payload === 'object' && payload !== null ? { ...payload } : {};
        if (!cleanPayload.created_at) cleanPayload.created_at = new Date().toISOString();
        if (!cleanPayload.updated_at) cleanPayload.updated_at = new Date().toISOString();
        const { data, error } = await client.from(table).insert(cleanPayload).select().single();
        if (error) throw error;
        return data as unknown as T;
      },
      update: async (id: string, payload: Partial<T> | Record<string, unknown>): Promise<T> => {
        const cleanPayload = typeof payload === 'object' && payload !== null ? { ...payload } : {};
        cleanPayload.updated_at = new Date().toISOString();
        const { data, error } = await client.from(table).update(cleanPayload).eq('id', id).select().single();
        if (error) throw error;
        return data as unknown as T;
      },
      delete: async (id: string): Promise<boolean> => {
        const { error } = await client.from(table).delete().eq('id', id);
        return !error;
      },
    }),
    filter: (): never => {
      throw new Error(
        '[supabase-admin] getAdminPb().filter() is not supported. Use a native Supabase query with .eq()/.in() instead.'
      );
    },
  };
}

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

export function getPbUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

/**
 * Writes an entry to the audit_log table in Supabase.
 */
export async function writeAuditLog(
  actor: string,
  action: AuditAction,
  collection: string,
  recordId?: string,
  oldValue?: Record<string, unknown>,
  newValue?: Record<string, unknown>,
  meta?: { ip?: string; userAgent?: string }
): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    await supabase.from('audit_log').insert({
      actor,
      action,
      collection,
      record_id: recordId || null,
      old_value: oldValue ? JSON.stringify(oldValue) : null,
      new_value: newValue ? JSON.stringify(newValue) : null,
      ip: meta?.ip || null,
      user_agent: meta?.userAgent || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn(`[supabase-admin] Warning: Failed to write audit log: ${cleanErrorMessage((err as Error).message)}`);
  }
}

export async function checkSupabaseHealth(): Promise<boolean> {
  try {
    const supabase = getAdminSupabase();
    const { error } = await supabase.from('site_settings').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}
