import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireAccountAccess } from '@/lib/account';

export const runtime = 'nodejs';

function validTemplate(t: string) {
  const body = (t || '').trim();
  if (!body) return 'Template cannot be empty';
  if (body.length > 160) return 'Template exceeds 160 characters';
  // validation removed (footer added conditionally)
  if (!/\{\{\s*brand\s*\}\}/i.test(body)) return 'Template must include {{brand}}';
  return null;
}

export async function GET() {
  // Check authentication and get account ID
  const accountId = await requireAccountAccess();
  if (!accountId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('brand, template_opener, template_nudge, template_reslot')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    brand: data?.brand || 'OutboundRevive',
    opener: data?.template_opener || '',
    nudge: data?.template_nudge || '',
    reslot: data?.template_reslot || ''
  });
}

export async function PATCH(req: NextRequest) {
  try {
    // Check authentication and get account ID
    const accountId = await requireAccountAccess();
    if (!accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const opener = String(body.opener ?? '');
    const nudge  = String(body.nudge  ?? '');
    const reslot = String(body.reslot ?? '');

    for (const [name, t] of [['Opener', opener], ['Nudge', nudge], ['Reslot', reslot]] as const) {
      const err = validTemplate(t);
      if (err) return NextResponse.json({ error: `${name}: ${err}` }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('app_settings')
      .upsert({
        account_id: accountId,
        template_opener: opener,
        template_nudge: nudge,
        template_reslot: reslot,
        updated_at: new Date().toISOString()
      });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'Invalid JSON' }, { status: 400 });
  }
}
