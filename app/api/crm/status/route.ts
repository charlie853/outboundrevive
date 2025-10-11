import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { supabaseAdmin } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has CRM connection
    const { data: userData, error } = await supabaseAdmin
      .from('user_data')
      .select('nango_token, crm')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching user CRM status:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const hasConnection = !!(userData?.nango_token && userData?.crm);

    return NextResponse.json({
      connected: hasConnection,
      provider: userData?.crm || null,
    });
  } catch (error) {
    console.error('Error checking CRM status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}