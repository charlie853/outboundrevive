import { NextRequest, NextResponse } from 'next/server';
import { Nango } from '@nangohq/node';
import { createClient } from '@supabase/supabase-js';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });

const CRM_INTEGRATIONS = [
  'hubspot',
  'salesforce',
  // 'pipedrive', - annoying to get token for
  'zoho-crm',
  // 'gohighlevel' // TODO: Add when we build direct OAuth (Nango doesn't support it)
];

// Helper to create Supabase client from Authorization header (for client-side calls)
function supabaseUserClientFromReq(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const headers: Record<string, string> = {};
  if (m && m[1]) headers.Authorization = `Bearer ${m[1]}`;
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers }
  });
  return { supabase, token: m?.[1] || null };
}

// Service role client for user_data lookup
const svc = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function getAccountIdForUser(supabase: ReturnType<typeof svc>, userId: string): Promise<string | null> {
  const { data } = await supabase.from('user_data').select('account_id').eq('user_id', userId).maybeSingle();
  return data?.account_id ?? null;
}

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user from client-side Authorization header
    const { supabase } = supabaseUserClientFromReq(req);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('[session-token] Unauthorized:', userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get account ID from user metadata or user_data table
    let accountId = (user.user_metadata as any)?.account_id as string | undefined;
    if (!accountId) {
      const service = svc();
      accountId = await getAccountIdForUser(service, user.id);
    }
    
    if (!accountId) {
      console.error('[session-token] No account ID for user:', user.id);
      return NextResponse.json({ error: 'No account found' }, { status: 403 });
    }

    const userId = user.id;
    const email = user.email || undefined;

    console.log('Creating Nango session for authenticated user:', { accountId, userId, email });

    const response = await nango.createConnectSession({
      end_user: {
        id: userId,
        email: email || undefined,
        display_name: email || userId,
        tags: { accountId }
      },
      allowed_integrations: CRM_INTEGRATIONS,
    });

    return NextResponse.json({
      sessionToken: response.data.token
    });
  } catch (error: any) {
    console.error('Error creating Nango session token:', JSON.stringify(error));
    
    return NextResponse.json(
      { 
        error: 'Failed to create session token',
        details: error.response?.data || error.message
      },
      { status: 500 }
    );
  }
}
