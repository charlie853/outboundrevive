import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { executeCrmSync, loadActiveCrmConnection } from '@/lib/crm/sync-service';
import { SyncStrategy, CRMProvider } from '@/lib/crm/types';
import { supabaseAdmin } from '@/lib/supabaseServer';

function supabaseUserClientFromReq(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => {
          const cookies: { name: string; value: string }[] = [];
          req.cookies.getAll().forEach((c) => cookies.push({ name: c.name, value: c.value }));
          return cookies;
        },
        setAll: () => {},
      },
      global: {
        headers: {
          Authorization: req.headers.get('Authorization') || '',
        },
      },
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabase = supabaseUserClientFromReq(request);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      console.error('[crm/sync] Unauthorized:', userError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const strategy: SyncStrategy = body?.strategy || 'append';

    if (!['append', 'overwrite', 'preview'].includes(strategy)) {
      return NextResponse.json({ error: 'Invalid strategy' }, { status: 400 });
    }

    // Get account ID from user metadata or user_data table
    let accountId = (user.user_metadata as any)?.account_id as string | undefined;
    if (!accountId) {
      const { data: userData } = await supabaseAdmin
        .from('user_data')
        .select('account_id')
        .eq('user_id', user.id)
        .maybeSingle();
      accountId = userData?.account_id;
    }
    
    if (!accountId) {
      return NextResponse.json({ error: 'No account found' }, { status: 400 });
    }

    let connection = await loadActiveCrmConnection(accountId);

    if (!connection) {
      const { data: legacy, error: legacyError } = await supabaseAdmin
        .from('user_data')
        .select('crm, nango_token')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (legacyError && legacyError.code !== 'PGRST116') {
        console.warn('Legacy CRM lookup failed:', legacyError);
      }

      if (legacy?.nango_token && legacy?.crm) {
        connection = {
          accountId,
          provider: legacy.crm as CRMProvider,
          accessToken: legacy.nango_token,
        };
      }
    }

    if (!connection) {
      return NextResponse.json({ error: 'No CRM connection found' }, { status: 400 });
    }

    const { contacts, result } = await executeCrmSync({
      ...connection,
      strategy,
    });

    if (strategy === 'preview') {
      return NextResponse.json({
        success: true,
        contacts,
      });
    }

    return NextResponse.json({
      success: true,
      results: result,
    });
  } catch (error) {
    console.error('Error syncing CRM contacts:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
