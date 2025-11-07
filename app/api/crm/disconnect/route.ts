import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { createCRMAdapter } from '@/lib/crm/factory';
import { CRMProvider } from '@/lib/crm/types';
import { getUserAndAccountFromRequest } from '@/lib/api/supabase-auth';

export async function POST(request: NextRequest) {
  try {
    const { user, accountId, error } = await getUserAndAccountFromRequest(request, { requireUser: true });
    if (!user || error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!accountId) {
      return NextResponse.json({ error: 'No account found' }, { status: 400 });
    }

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from('crm_connections')
      .select('provider, nango_connection_id, is_active')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connectionError && connectionError.code !== 'PGRST116') {
      console.warn('[crm/disconnect] Failed to fetch crm_connections row:', connectionError);
    }

    if (connection?.provider) {
      try {
        const adapter = createCRMAdapter(connection.provider as CRMProvider);
        const metadata = await supabaseAdmin
          .from('user_data')
          .select('nango_token')
          .eq('user_id', user.id)
          .maybeSingle();

        const token = metadata.data?.nango_token;
        if (token) {
          await adapter.disconnect(token);
        }
      } catch (error) {
        console.warn('[crm/disconnect] CRM adapter disconnect warning:', error);
      }
    }

    const { error: deactivateError } = await supabaseAdmin
      .from('crm_connections')
      .update({ is_active: false, last_synced_at: null })
      .eq('account_id', accountId);

    if (deactivateError) {
      console.error('[crm/disconnect] Failed to deactivate crm_connections:', deactivateError);
    }

    const { error: clearError } = await supabaseAdmin
      .from('user_data')
      .update({
        nango_token: null,
        crm: null,
      })
      .eq('user_id', user.id);

    if (clearError) {
      console.error('[crm/disconnect] Error clearing legacy CRM data:', clearError);
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'CRM disconnected successfully',
    });
  } catch (error) {
    console.error('[crm/disconnect] Error disconnecting CRM:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Disconnect failed' },
      { status: 500 }
    );
  }
}
