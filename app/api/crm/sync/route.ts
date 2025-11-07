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
      console.error('[crm/sync] No account ID found for user:', user.id);
      return NextResponse.json({ error: 'No account found' }, { status: 400 });
    }

    console.log('[crm/sync] Looking up CRM connection for account:', accountId);
    let connection = await loadActiveCrmConnection(accountId);
    console.log('[crm/sync] Active CRM connection result:', connection ? { provider: connection.provider, hasConnectionId: !!connection.connectionId } : 'null');

    if (!connection) {
      console.log('[crm/sync] No active connection found, checking legacy user_data...');
      const { data: legacy, error: legacyError } = await supabaseAdmin
        .from('user_data')
        .select('crm, nango_token, user_id')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log('[crm/sync] Legacy user_data query result:', {
        found: !!legacy,
        hasCrm: !!legacy?.crm,
        hasToken: !!legacy?.nango_token,
        error: legacyError?.message,
      });

      if (legacyError && legacyError.code !== 'PGRST116') {
        console.warn('[crm/sync] Legacy CRM lookup failed:', legacyError);
      }

      if (legacy?.nango_token && legacy?.crm) {
        connection = {
          accountId,
          provider: legacy.crm as CRMProvider,
          accessToken: legacy.nango_token,
        };
        console.log('[crm/sync] Using legacy connection for provider:', legacy.crm);
      }
    }

    if (!connection) {
      console.error('[crm/sync] No CRM connection found for account:', accountId);
      return NextResponse.json({ error: 'No CRM connection found. Please connect your CRM first.' }, { status: 400 });
    }

    console.log('[crm/sync] Starting sync with strategy:', strategy, 'provider:', connection.provider);

    const { contacts, result } = await executeCrmSync({
      ...connection,
      strategy,
    });

    console.log('[crm/sync] Sync completed:', {
      totalContacts: contacts.length,
      created: result?.created,
      updated: result?.updated,
      skipped: result?.skipped,
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
    console.error('[crm/sync] Error syncing CRM contacts:', error);
    const errorMessage = error instanceof Error ? error.message : 'Sync failed';
    const errorDetails = error instanceof Error ? error.stack : String(error);
    console.error('[crm/sync] Error details:', errorDetails);
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
