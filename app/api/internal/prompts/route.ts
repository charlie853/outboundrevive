// app/api/internal/prompts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
export const runtime = 'nodejs';

function adminGuard(req: NextRequest) {
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (req.headers.get('x-admin-token') || '').trim();
  return !!want && got === want;
}

export async function GET(req: NextRequest) {
  if (!adminGuard(req)) return NextResponse.json({ error:'unauthorized' }, { status:401 });
  const url = new URL(req.url);
  const ver = url.searchParams.get('blueprint_version_id');
  const intent = url.searchParams.get('intent');
  let q = db.from('prompt_templates').select('*').order('created_at', { ascending:false }).limit(200);
  if (ver) q = q.eq('blueprint_version_id', ver);
  if (intent) q = q.eq('intent', intent);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status:500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!adminGuard(req)) return NextResponse.json({ error:'unauthorized' }, { status:401 });
  const body = await req.json();
  const row = {
    blueprint_version_id: body.blueprint_version_id,
    intent: body.intent,
    body: String(body.body || ''),
    max_len: body.max_len ?? 160,
    enabled: body.enabled ?? true,
  };
  // simple lint: must be <= max_len once rendered with safe defaults
  const example = row.body
    .replaceAll('{{first_name}}','there')
    .replaceAll('{{brand}}','OutboundRevive')
    .replaceAll('{{slotA}}','Tue 2p')
    .replaceAll('{{slotB}}','Wed 10a')
    .replaceAll('{{booking_link}}','https://cal.example/abc');
  if (example.length > row.max_len) {
    return NextResponse.json({ error: 'template_exceeds_max_len', example_len: example.length }, { status:400 });
  }
  const { data, error } = await db.from('prompt_templates').insert(row).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status:500 });
  return NextResponse.json({ ok:true, prompt: data });
}
