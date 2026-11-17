import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

// Hanya anon key. service_role TIDAK BOLEH ada di frontend.
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anonKey!, { auth: { persistSession: false } })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED');
  return supabase;
}
