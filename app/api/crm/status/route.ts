import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getUserAndAccountFromRequest } from '@/lib/api/supabase-auth';

export async function GET(request: NextRequest) {
  try {
    const { user, accountId, error } = await getUserAndAccountFromRequest(request, { requireUser: true });

    if (!user || error) {
      console.error('[crm/status] Unauthorized:', error);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!accountId) {
      console.warn('[crm/status] No account ID for user:', user.id);
      return NextResponse.json({ connected: false, provider: null });
    }

    console.log('[crm/status] Checking CRM connection for account:', accountId);

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from('crm_connections')
      .select('provider, is_active, last_synced_at, nango_connection_id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connectionError && connectionError.code !== 'PGRST116') {
      console.error('[crm/status] Error fetching CRM connection:', connectionError);
    }

    console.log('[crm/status] Connection query result:', { connection, error: connectionError });

    if (connection && connection.is_active) {
      console.log('[crm/status] Active CRM connection found:', {
        provider: connection.provider,
        connectionId: connection.nango_connection_id,
        lastSynced: connection.last_synced_at,
      });
      return NextResponse.json({
        connected: true,
        provider: connection.provider,
        lastSyncedAt: connection.last_synced_at || null,
        connectionId: connection.nango_connection_id || null,
      });
    }

    console.log('[crm/status] No active connection in crm_connections, checking legacy user_data...');

    const { data: userData, error: userDataError } = await supabaseAdmin
      .from('user_data')
      .select('nango_token, crm')
      .eq('user_id', user.id)
      .maybeSingle();

    if (userDataError && userDataError.code !== 'PGRST116') {
      console.error('[crm/status] Error fetching user CRM status:', userDataError);
    }

    const hasLegacyConnection = !!(userData?.nango_token && userData?.crm);

    return NextResponse.json({
      connected: hasLegacyConnection,
      provider: userData?.crm || null,
    });
  } catch (error) {
    console.error('[crm/status] Error checking CRM status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
