// Prompt editor with versioning
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const accountId = req.nextUrl.searchParams.get('account_id');
    if (!accountId) return NextResponse.json({ error: 'Missing account_id' }, { status: 400 });

    // Get current active prompt
    const { data: active } = await supabaseAdmin
      .from('prompt_versions')
      .select('*')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get all versions
    const { data: versions } = await supabaseAdmin
      .from('prompt_versions')
      .select('*')
      .eq('account_id', accountId)
      .order('version', { ascending: false })
      .limit(50);

    return NextResponse.json({
      current: active?.content || '',
      versions: versions || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { account_id, content } = await req.json();
    if (!account_id || !content) return NextResponse.json({ error: 'Missing account_id or content' }, { status: 400 });

    // Get latest version number
    const { data: latest } = await supabaseAdmin
      .from('prompt_versions')
      .select('version')
      .eq('account_id', account_id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latest?.version || 0) + 1;

    // Deactivate all existing versions
    await supabaseAdmin
      .from('prompt_versions')
      .update({ is_active: false })
      .eq('account_id', account_id);

    // Insert new version as active
    const { data, error } = await supabaseAdmin
      .from('prompt_versions')
      .insert({
        account_id,
        content: String(content).slice(0, 50000),
        version: nextVersion,
        is_active: true,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'DB error', detail: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, version: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}

