import { NextRequest, NextResponse } from 'next/server';
import { executeCrmSync, loadActiveCrmConnection } from '@/lib/crm/sync-service';
import { SyncStrategy, CRMProvider } from '@/lib/crm/types';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getUserAndAccountFromRequest } from '@/lib/api/supabase-auth';

export async function POST(request: NextRequest) {
  try {
    const { user, accountId, error } = await getUserAndAccountFromRequest(request, { requireUser: true });

    if (!user || error) {
      console.error('[crm/sync] Unauthorized:', error?.message || 'No user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const strategy: SyncStrategy = body?.strategy || 'append';

    if (!['append', 'overwrite', 'preview'].includes(strategy)) {
      return NextResponse.json({ error: 'Invalid strategy' }, { status: 400 });
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
        console.warn('[crm/sync] Legacy CRM lookup failed:', legacyError);
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
