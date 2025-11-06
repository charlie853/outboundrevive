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
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;
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
  process.env.SUPABASE_URL!,
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
      accountId = (await getAccountIdForUser(service, user.id)) || undefined;
    }
    
    if (!accountId) {
      console.error('[session-token] No account ID for user:', user.id);
      return NextResponse.json({ error: 'No account found' }, { status: 403 });
    }

    const userId = user.id;
    const email = user.email || undefined;

    console.log('[session-token] Creating Nango session for authenticated user:', { accountId, userId, email });
    console.log('[session-token] NANGO_SECRET_KEY is set:', !!process.env.NANGO_SECRET_KEY);
    console.log('[session-token] NANGO_SECRET_KEY length:', process.env.NANGO_SECRET_KEY?.length);
    console.log('[session-token] Allowed integrations:', CRM_INTEGRATIONS);

    try {
      const response = await nango.createConnectSession({
        end_user: {
          id: userId,
          email: email || undefined,
          display_name: email || userId,
          tags: { accountId }
        },
        allowed_integrations: CRM_INTEGRATIONS,
      });

      console.log('[session-token] Nango session created successfully');
      return NextResponse.json({
        sessionToken: response.data.token
      });
    } catch (nangoError: any) {
      console.error('[session-token] Nango API error:', {
        message: nangoError.message,
        response: nangoError.response?.data,
        status: nangoError.response?.status,
        stack: nangoError.stack?.split('\n').slice(0, 3)
      });
      
      return NextResponse.json(
        { 
          error: 'Failed to create session token',
          details: nangoError.response?.data || nangoError.message || 'Unknown Nango error'
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[session-token] Unexpected error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
