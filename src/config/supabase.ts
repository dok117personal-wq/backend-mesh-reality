import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';

export const supabase: SupabaseClient = createClient(
  env.supabase.url,
  env.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/** Client with anon key for auth flows (e.g. signInWithIdToken). Used by backend only. */
export const supabaseAuthClient: SupabaseClient | null =
  env.supabase.url && env.supabase.anonKey
    ? createClient(env.supabase.url, env.supabase.anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;
