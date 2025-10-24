import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { createCRMAdapter } from '@/lib/crm/factory';
import { CRMProvider } from '@/lib/crm/types';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's CRM connection
    const { data: userData, error: userError } = await supabaseAdmin
      .from('user_data')
      .select('nango_token, crm')
      .eq('user_id', user.id)
      .single();

    if (userError || !userData?.nango_token || !userData?.crm) {
      return NextResponse.json({ error: 'No CRM connection found' }, { status: 400 });
    }

    // Call CRM-specific disconnect logic (e.g., revoke tokens)
    try {
      const adapter = createCRMAdapter(userData.crm as CRMProvider);
      await adapter.disconnect(userData.nango_token);
    } catch (error) {
      console.warn('CRM disconnect warning:', error);
      // Continue with local cleanup even if CRM-side disconnect fails
    }

    // Clear the connection from database
    const { error: updateError } = await supabaseAdmin
      .from('user_data')
      .update({
        nango_token: null,
        crm: null,
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error clearing CRM connection:', updateError);
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'CRM disconnected successfully',
    });
  } catch (error) {
    console.error('Error disconnecting CRM:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Disconnect failed' },
      { status: 500 }
    );
  }
}
