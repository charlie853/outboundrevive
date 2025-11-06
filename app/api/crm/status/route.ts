import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getCurrentUserAccountId } from '@/lib/account';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the user's account ID
    const accountId = await getCurrentUserAccountId();
    if (!accountId) {
      return NextResponse.json({ connected: false, provider: null });
    }

    // Check crm_connections table (new source of truth)
    const { data: connection, error: connectionError } = await supabaseAdmin
      .from('crm_connections')
      .select('provider, is_active, last_synced_at')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connectionError && connectionError.code !== 'PGRST116') {
      console.error('Error fetching CRM connection:', connectionError);
      // Fall through to legacy check
    }

    if (connection && connection.is_active) {
      return NextResponse.json({
        connected: true,
        provider: connection.provider,
        lastSyncedAt: connection.last_synced_at || null,
      });
    }

    // Legacy: Check user_data table for backwards compatibility
    const { data: userData, error: userDataError } = await supabaseAdmin
      .from('user_data')
      .select('nango_token, crm')
      .eq('user_id', user.id)
      .maybeSingle();

    if (userDataError && userDataError.code !== 'PGRST116') {
      console.error('Error fetching user CRM status:', userDataError);
    }

    const hasLegacyConnection = !!(userData?.nango_token && userData?.crm);

    return NextResponse.json({
      connected: hasLegacyConnection,
      provider: userData?.crm || null,
    });
  } catch (error) {
    console.error('Error checking CRM status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
