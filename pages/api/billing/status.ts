import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Helper to get account_id from authenticated session
async function getAccountIdFromSession(req: NextApiRequest): Promise<string | null> {
  try {
    // Get the session token from cookies
    const cookies = req.headers.cookie || '';
    const tokenMatch = cookies.match(/sb-[^=]+-auth-token=([^;]+)/);
    
    if (!tokenMatch) {
      console.log('[billing/status] No auth token in cookies');
      return null;
    }

    // Decode the token (it's URL-encoded JSON)
    const tokenData = JSON.parse(decodeURIComponent(tokenMatch[1]));
    const accessToken = tokenData?.access_token;
    
    if (!accessToken) {
      console.log('[billing/status] No access_token in token data');
      return null;
    }

    // Create a Supabase client with the user's token
    const supabase = createClient(URL, ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    // Get the user
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      console.log('[billing/status] Auth error or no user:', error?.message);
      return null;
    }

    console.log('[billing/status] Authenticated user:', user.id);

    // Get account_id from user_data table
    const supabaseAdmin = createClient(URL, KEY);
    const { data, error: accountError } = await supabaseAdmin
      .from('user_data')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (accountError || !data) {
      console.log('[billing/status] Could not fetch account_id:', accountError?.message);
      return null;
    }

    console.log('[billing/status] Found account_id:', data.account_id);
    return data.account_id;
  } catch (err: any) {
    console.error('[billing/status] Session parsing error:', err.message);
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL || !KEY) return res.status(500).json({ ok: false, error: 'Supabase env missing' });

  // Try to get account_id from session first, then fall back to query param or default
  let accountId = await getAccountIdFromSession(req);
  
  if (!accountId) {
    accountId = (Array.isArray(req.query.account_id) ? req.query.account_id[0] : req.query.account_id) || process.env.DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111';
    console.log('[billing/status] Using fallback account_id:', accountId);
  }
  
  console.log('[billing/status] Final account_id:', accountId);
  
  try {
    const r = await fetch(`${URL}/rest/v1/tenant_billing?select=plan_tier,monthly_cap_segments,segments_used,warn_80_sent&account_id=eq.${encodeURIComponent(accountId)}&limit=1`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) {
      console.log('[billing/status] No billing data found');
      return res.status(200).json({ ok: true, plan: null, account_id: accountId });
    }
    const rows = await r.json().catch(() => []);
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    
    console.log('[billing/status] Returning:', { ...row, account_id: accountId });
    
    // IMPORTANT: Always include account_id in response
    return res.status(200).json({ ok: true, account_id: accountId, ...row });
  } catch (e: any) {
    console.error('[billing/status] Error:', e.message);
    return res.status(200).json({ ok: true, plan: null, account_id: accountId, error: e?.message });
  }
}


