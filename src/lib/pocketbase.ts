import { supabase } from './supabase';

export const pb: any = {
  authStore: {
    isValid: false,
    model: null,
    clear: () => {
      supabase.auth.signOut().catch(() => null);
    },
  },
  autoCancellation: () => {},
  collection: (table: string) => ({
    authWithPassword: async () => ({ token: '', record: null }),
    authRefresh: async () => ({ token: '', record: null }),
    getFullList: async () => {
      const { data } = await supabase.from(table).select('*');
      return data || [];
    },
    getList: async (page = 1, perPage = 50) => {
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
      const { data, count } = await supabase.from(table).select('*', { count: 'exact' }).range(from, to);
      return { items: data || [], totalItems: count || 0, totalPages: Math.ceil((count || 0) / perPage) };
    },
    getOne: async (id: string) => {
      const { data } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      return data;
    },
    getFirstListItem: async () => {
      const { data } = await supabase.from(table).select('*').limit(1).maybeSingle();
      return data;
    },
    create: async (data: any) => {
      const { data: res } = await supabase.from(table).insert(data).select().single();
      return res;
    },
    update: async (id: string, data: any) => {
      const { data: res } = await supabase.from(table).update(data).eq('id', id).select().single();
      return res;
    },
    delete: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      return !error;
    },
  }),
  filter: (): never => {
    throw new Error('[pocketbase-compat] pb.filter() is not supported. Use native Supabase queries instead.');
  },
};

export function isUserAuthenticated(): boolean {
  return false;
}

export function getCurrentUser() {
  return null;
}
