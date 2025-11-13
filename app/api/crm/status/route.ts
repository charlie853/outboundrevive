import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getUserAndAccountFromRequest } from '@/lib/api/supabase-auth';

export async function GET(request: NextRequest) {
  try {
    const { user, accountId, error } = await getUserAndAccountFromRequest(request, { requireUser: false });

    // If no user session, try to get account_id from query params as fallback
    let finalAccountId = accountId;
    if (!finalAccountId && !user) {
      const queryAccountId = request.nextUrl.searchParams.get('account_id');
      if (queryAccountId) {
        console.log('[crm/status] No auth session, using account_id from query:', queryAccountId);
        finalAccountId = queryAccountId;
      }
    }

    if (!finalAccountId) {
      console.warn('[crm/status] No account ID available');
      return NextResponse.json({ connected: false, provider: null });
    }

    console.log('[crm/status] Checking CRM connection for account:', finalAccountId);

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from('crm_connections')
      .select('provider, is_active, last_synced_at, nango_connection_id')
      .eq('account_id', finalAccountId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connectionError && connectionError.code !== 'PGRST116') {
      console.error('[crm/status] Error fetching CRM connection:', connectionError);
    }

    console.log('[crm/status] Connection query result:', { 
      connection: connection ? { provider: connection.provider, active: connection.is_active } : null, 
      error: connectionError?.message 
    });

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

    console.log('[crm/status] No active connection in crm_connections');

    // Only check legacy user_data if we have a user session
    if (user) {
      console.log('[crm/status] Checking legacy user_data for user:', user.id);
      const { data: userData, error: userDataError } = await supabaseAdmin
        .from('user_data')
        .select('nango_token, crm')
        .eq('user_id', user.id)
        .maybeSingle();

      if (userDataError && userDataError.code !== 'PGRST116') {
        console.error('[crm/status] Error fetching user CRM status:', userDataError);
      }

      const hasLegacyConnection = !!(userData?.nango_token && userData?.crm);

      if (hasLegacyConnection) {
        console.log('[crm/status] Found legacy connection for provider:', userData?.crm);
        return NextResponse.json({
          connected: true,
          provider: userData?.crm || null,
        });
      }
    }

    return NextResponse.json({
      connected: false,
      provider: null,
    });
  } catch (error) {
    console.error('[crm/status] Error checking CRM status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
