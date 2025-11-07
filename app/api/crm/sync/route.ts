import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { getCurrentUserAccountId } from '@/lib/account';
import { executeCrmSync, loadActiveCrmConnection } from '@/lib/crm/sync-service';
import { SyncStrategy, CRMProvider } from '@/lib/crm/types';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const strategy: SyncStrategy = body?.strategy || 'append';

    if (!['append', 'overwrite', 'preview'].includes(strategy)) {
      return NextResponse.json({ error: 'Invalid strategy' }, { status: 400 });
    }

    const accountId = await getCurrentUserAccountId();
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
