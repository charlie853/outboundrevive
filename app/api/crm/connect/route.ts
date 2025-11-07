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
      console.error('[crm/connect] Unauthorized:', error);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!accountId) {
      console.error('[crm/connect] No account ID for user:', user.id);
      return NextResponse.json({ error: 'No account found for user' }, { status: 400 });
    }

    const { connectionId, providerConfigKey } = await request.json();

    console.log('[crm/connect] Received connection request:', {
      userId: user.id,
      accountId,
      connectionId,
      providerConfigKey,
    });

    if (!connectionId || !providerConfigKey) {
      return NextResponse.json({ error: 'Missing connectionId or providerConfigKey' }, { status: 400 });
    }

    console.log('[crm/connect] Fetching connection from Nango...');
    const connection = await nango.getConnection(providerConfigKey, connectionId);

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const token = connection.credentials?.access_token;

    if (!token) {
      return NextResponse.json({ error: 'No access token found in connection' }, { status: 500 });
    }

    console.log('[crm/connect] Deactivating old connections for account:', accountId);
    const { error: deactivateError } = await supabaseAdmin
      .from('crm_connections')
      .update({ is_active: false })
      .eq('account_id', accountId)
      .eq('provider', providerConfigKey)
      .eq('is_active', true);

    if (deactivateError) {
      console.warn('[crm/connect] Error deactivating old connections:', deactivateError);
    }

    console.log('[crm/connect] Inserting new connection to crm_connections...');
    const { data: insertedConnection, error: insertError } = await supabaseAdmin
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
      })
      .select()
      .single();

    if (insertError) {
      console.error('[crm/connect] Error saving to crm_connections:', insertError);
      return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 });
    }

    console.log('[crm/connect] Connection inserted successfully:', insertedConnection);

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

    console.log(`✅ CRM connection saved: ${providerConfigKey} for account ${accountId}, connection ID: ${connectionId}`);

    // Run an initial sync in the background but don't block the response
    // Use setTimeout to ensure this happens AFTER the response is sent
    setTimeout(() => {
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
    }, 100);

    return NextResponse.json({
      success: true,
      provider: providerConfigKey,
      connectionId,
      message: 'CRM connection saved successfully. Syncing contacts in the background...',
    });
  } catch (error) {
    console.error('Error handling CRM connection:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Connection failed' },
      { status: 500 }
    );
  }
}
