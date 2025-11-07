import { NextRequest, NextResponse } from 'next/server';
import { Nango } from '@nangohq/node';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { executeCrmSync } from '@/lib/crm/sync-service';
import { CRMProvider } from '@/lib/crm/types';
import { getUserAndAccountFromRequest } from '@/lib/api/supabase-auth';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });

export async function POST(request: NextRequest) {
  try {
    const { user, accountId, error } = await getUserAndAccountFromRequest(request, { requireUser: true });
    if (!user || error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!accountId) {
      return NextResponse.json({ error: 'No account found for user' }, { status: 400 });
    }

    const { connectionId, providerConfigKey } = await request.json();

    if (!connectionId || !providerConfigKey) {
      return NextResponse.json({ error: 'Missing connectionId or providerConfigKey' }, { status: 400 });
    }

    const connection = await nango.getConnection(providerConfigKey, connectionId);

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const token = connection.credentials?.access_token;

    if (!token) {
      return NextResponse.json({ error: 'No access token found in connection' }, { status: 500 });
    }

    const { error: deactivateError } = await supabaseAdmin
      .from('crm_connections')
      .update({ is_active: false })
      .eq('account_id', accountId)
      .eq('provider', providerConfigKey)
      .eq('is_active', true);

    if (deactivateError) {
      console.warn('[crm/connect] Error deactivating old connections:', deactivateError);
    }

    const { error: insertError } = await supabaseAdmin
      .from('crm_connections')
      .insert({
        account_id: accountId,
        provider: providerConfigKey,
        nango_connection_id: connectionId,
        connection_metadata: {
          scopes: connection.credentials?.raw?.scope,
          connection_config: connection.connection_config,
          created_at: connection.created_at,
        },
        is_active: true,
      });

    if (insertError) {
      console.error('[crm/connect] Error saving to crm_connections:', insertError);
      return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('user_data')
      .update({
        nango_token: token,
        crm: providerConfigKey,
        account_id: accountId,
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.warn('[crm/connect] Error updating user_data (non-critical):', updateError);
    }

    console.log(`✅ CRM connection saved: ${providerConfigKey} for account ${accountId}`);

    // Run an initial sync in the background but don't block the response
    executeCrmSync({
      accountId,
      provider: providerConfigKey as CRMProvider,
      connectionId,
      strategy: 'append',
    })
      .then(({ result }) => {
        console.log('✅ Initial CRM sync completed', {
          accountId,
          provider: providerConfigKey,
          created: result?.created,
          updated: result?.updated,
          skipped: result?.skipped,
          total: result?.total,
        });
      })
      .catch((err) => {
        console.error('❌ Initial CRM sync failed', err);
      });

    return NextResponse.json({
      success: true,
      provider: providerConfigKey,
      connectionId,
    });
  } catch (error) {
    console.error('Error handling CRM connection:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Connection failed' },
      { status: 500 }
    );
  }
}
