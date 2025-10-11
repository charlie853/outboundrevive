import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Client-side Supabase client with safe fallbacks in dev so the app doesn't crash
// when env vars are not injected locally. For production, ensure the NEXT_PUBLIC_*
// envs are set in your hosting provider.

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'http://localhost:54321';

const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'public-anon-key';

// Note: Using local defaults prevents build-time crashes. If you are not running
// a local Supabase instance, requests may fail at runtime until real envs are set.
export const supabase: SupabaseClient = createClient(URL, ANON);

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn('[supabase] NEXT_PUBLIC_SUPABASE_URL/ANON_KEY not set. Using dev defaults.');
}
