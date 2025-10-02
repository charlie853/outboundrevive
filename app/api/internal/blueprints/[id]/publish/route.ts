// app/api/internal/blueprints/[id]/publish/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

// POST /api/internal/blueprints/:id/publish
export async function POST(_req: NextRequest, { params }: any) {
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (_req.headers.get('x-admin-token') || '').trim();
  if (!want || got !== want) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = params?.id as string;
  try {
    // Exists?
    const { data: bp, error: bpErr } = await supabaseAdmin
      .from('account_blueprints')
      .select('id, account_id, status')
      .eq('id', id)
      .maybeSingle();

    if (bpErr || !bp) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    // Load sections
    const { data: sections, error: secErr } = await supabaseAdmin
      .from('blueprint_sections')
      .select('key, data_json')
      .eq('account_blueprint_id', id);

    if (secErr) {
      return NextResponse.json({ error: secErr.message }, { status: 500 });
    }

    const map: Record<string, any> = {};
    for (const s of sections || []) map[s.key] = s.data_json;

    // Compile → settings (minimal v0)
    const brandVoice = map['brand_voice'] || {};
    const compliance = map['compliance'] || {};

    const template_opener = brandVoice.opener
      || 'Hi {{first_name}}—{{brand}} here. Txt STOP to opt out';
    const template_nudge  = brandVoice.nudge
      || '{{brand}}: still want to chat? Txt STOP to opt out';

    const quiet_start = compliance.quiet_start || '08:00';
    const quiet_end   = compliance.quiet_end   || '21:00';

    // Apply to app_settings (managed_mode + autopilot on)
    const upd = {
      id: 'default',
      quiet_start,
      quiet_end,
      template_opener,
      template_nudge,
      managed_mode: true,
      autopilot_enabled: true,
      updated_at: new Date().toISOString(),
    };

    const { error: setErr } = await supabaseAdmin
      .from('app_settings')
      .upsert(upd, { onConflict: 'id' });

    if (setErr) {
      return NextResponse.json({ error: setErr.message }, { status: 500 });
    }

    // Versioning
    const { data: versions, error: verErr } = await supabaseAdmin
      .from('blueprint_versions')
      .select('version')
      .eq('account_blueprint_id', id);

    if (verErr) {
      return NextResponse.json({ error: verErr.message }, { status: 500 });
    }

    const nextVersion = (versions || []).reduce((max, v: any) => Math.max(max, Number(v.version) || 0), 0) + 1;

    const { error: insVerErr } = await supabaseAdmin
      .from('blueprint_versions')
      .insert({
        account_blueprint_id: id,
        version: nextVersion,
        notes: 'Published via /internal/blueprints/:id/publish',
        published_at: new Date().toISOString(),
      });

    if (insVerErr) {
      return NextResponse.json({ error: insVerErr.message }, { status: 500 });
    }

    // Mark blueprint active (optional)
    await supabaseAdmin
      .from('account_blueprints')
      .update({ status: 'active' })
      .eq('id', id);

    return NextResponse.json({
      ok: true,
      blueprint_id: id,
      version: nextVersion,
      applied_settings: {
        quiet_start, quiet_end, template_opener, template_nudge,
        managed_mode: true, autopilot_enabled: true
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'publish_failed' }, { status: 500 });
  }
}
