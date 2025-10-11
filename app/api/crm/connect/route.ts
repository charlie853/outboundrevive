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

    // Update the existing user record with CRM connection details
    const token = connection.credentials?.access_token;

    if (!token) {
      return NextResponse.json({ error: 'No access token found in connection' }, { status: 500 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('user_data')
      .update({
        nango_token: token,
        crm: providerConfigKey,
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error saving CRM connection:', updateError);
      return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 });
    }

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