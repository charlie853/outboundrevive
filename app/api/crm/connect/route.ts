import { NextRequest, NextResponse } from 'next/server';
import { Nango } from '@nangohq/node';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getCurrentUserAccountId } from '@/lib/account';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { connectionId, providerConfigKey } = await request.json();

    if (!connectionId || !providerConfigKey) {
      return NextResponse.json({ error: 'Missing connectionId or providerConfigKey' }, { status: 400 });
    }

    // Get the user's account ID
    const accountId = await getCurrentUserAccountId();
    if (!accountId) {
      return NextResponse.json({ error: 'No account found for user' }, { status: 400 });
    }

    // Get the connection details from Nango
    const connection = await nango.getConnection(providerConfigKey, connectionId);

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // Get connection details
    const token = connection.credentials?.access_token;

    if (!token) {
      return NextResponse.json({ error: 'No access token found in connection' }, { status: 500 });
    }

    // NEW: Save to crm_connections table (proper schema)
    // First, deactivate any existing connection for this provider
    const { error: deactivateError } = await supabaseAdmin
      .from('crm_connections')
      .update({ is_active: false })
      .eq('account_id', accountId)
      .eq('provider', providerConfigKey)
      .eq('is_active', true);

    if (deactivateError) {
      console.warn('Error deactivating old connections:', deactivateError);
      // Continue anyway - not critical
    }

    // Insert new connection
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
      console.error('Error saving to crm_connections:', insertError);
      return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 });
    }

    // LEGACY: Also update user_data for backwards compatibility
    // (Some old code might still reference this)
    const { error: updateError } = await supabaseAdmin
      .from('user_data')
      .update({
        nango_token: token,
        crm: providerConfigKey,
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.warn('Error updating user_data (non-critical):', updateError);
      // Don't fail - new table is the source of truth now
    }

    console.log(`✅ CRM connection saved: ${providerConfigKey} for account ${accountId}`);

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
