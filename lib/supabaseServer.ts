import { createClient } from '@supabase/supabase-js';

// Server-side admin client (service role)
// Be resilient at build time by falling back to safe defaults so Next.js
// "collecting page data" doesn't crash if envs aren't injected during build.
const ADMIN_URL = process.env.SUPABASE_URL
  || process.env.NEXT_PUBLIC_SUPABASE_URL
  || 'http://localhost:54321';
const ADMIN_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || 'dev-service-role-key';

export const supabaseAdmin = createClient(ADMIN_URL, ADMIN_KEY, {
  auth: { persistSession: false }
});
