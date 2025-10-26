import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createSupabaseClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

export function createClient() {
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
