// app/api/internal/prompts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
export const runtime = 'nodejs';

function adminGuard(req: NextRequest) {
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (req.headers.get('x-admin-token') || '').trim();
  return !!want && got === want;
}

export async function PATCH(req: NextRequest, { params }: any) {
  if (!adminGuard(req)) return NextResponse.json({ error:'unauthorized' }, { status:401 });
  const id = params?.id as string;
  const body = await req.json();
  const update: any = {};
  for (const k of ['body','max_len','enabled','intent']) if (k in body) update[k] = body[k];
  if (update.body) {
    const example = String(update.body)
      .replaceAll('{{first_name}}','there')
      .replaceAll('{{brand}}','OutboundRevive')
      .replaceAll('{{slotA}}','Tue 2p')
      .replaceAll('{{slotB}}','Wed 10a')
      .replaceAll('{{booking_link}}','https://cal.example/abc');
    const lim = update.max_len ?? 160;
    if (example.length > lim) return NextResponse.json({ error:'template_exceeds_max_len', example_len: example.length }, { status:400 });
  }
  const { data, error } = await db.from('prompt_templates').update(update).eq('id', id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status:500 });
  return NextResponse.json({ ok:true, prompt: data });
}

export async function DELETE(req: NextRequest, { params }: any) {
  if (!adminGuard(req)) return NextResponse.json({ error:'unauthorized' }, { status:401 });
  const id = params?.id as string;
  const { error } = await db.from('prompt_templates').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status:500 });
  return NextResponse.json({ ok:true });
}
