import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseServer';

interface SupabaseFromRequestOptions {
  requireUser?: boolean;
}

export function createSupabaseClientFromRequest(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase environment variables are not configured');
  }

  const authHeader = req.headers.get('authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const headers: Record<string, string> = {};
  if (tokenMatch && tokenMatch[1]) {
    headers.Authorization = `Bearer ${tokenMatch[1]}`;
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => {
        const cookies: { name: string; value: string }[] = [];
        req.cookies.getAll().forEach((c) => cookies.push({ name: c.name, value: c.value }));
        return cookies;
      },
      setAll: () => {},
    },
    global: {
      headers,
    },
  });
}

export async function getUserAndAccountFromRequest(
  req: NextRequest,
  options: SupabaseFromRequestOptions = {}
): Promise<{ user: User | null; accountId: string | null; error?: Error }> {
  try {
    const supabase = createSupabaseClientFromRequest(req);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      if (options.requireUser) {
        return { user: null, accountId: null, error: error ?? new Error('Unauthorized') };
      }
      return { user: null, accountId: null, error: error ?? undefined };
    }

    // Try pulling account_id from user metadata first
    let accountId = (user.user_metadata as any)?.account_id as string | undefined;

    if (!accountId) {
      const { data, error: accountError } = await supabaseAdmin
        .from('user_data')
        .select('account_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (accountError) {
        return { user, accountId: null, error: accountError };
      }

      accountId = data?.account_id ?? undefined;
    }

    return {
      user,
      accountId: accountId ?? null,
    };
  } catch (err: any) {
    return {
      user: null,
      accountId: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
