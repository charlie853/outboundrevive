// Activate a specific prompt version
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { account_id, version_id } = await req.json();
    if (!account_id || !version_id) return NextResponse.json({ error: 'Missing account_id or version_id' }, { status: 400 });

    // Deactivate all versions
    await supabaseAdmin
      .from('prompt_versions')
      .update({ is_active: false })
      .eq('account_id', account_id);

    // Activate the specified version
    const { error } = await supabaseAdmin
      .from('prompt_versions')
      .update({ is_active: true })
      .eq('id', version_id)
      .eq('account_id', account_id);

    if (error) return NextResponse.json({ error: 'DB error', detail: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}

