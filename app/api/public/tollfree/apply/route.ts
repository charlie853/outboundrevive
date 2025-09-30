import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { checkRateLimit } from '@/lib/ratelimit';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const ok = await checkRateLimit(req.headers, 'public:tollfree', 2, 60);
    if (!ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    const { business_name, website, contact_email, support_hours, sample_messages, opt_in_description, hp } = await req.json().catch(()=>({}));
    if (hp && String(hp).trim() !== '') return NextResponse.json({ ok: true });
    if (!contact_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });

    const samples: string[] = Array.isArray(sample_messages) ? sample_messages.slice(0, 10) : [];
    // Normalize website to https
    const site = website ? (website.startsWith('http') ? website : `https://${website}`) : null;
    // provenance
    const ua = req.headers.get('user-agent') || null;
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || '';
    const ip_hash = ip ? crypto.createHash('sha256').update(ip).digest('hex') : null;

    const { data, error } = await supabaseAdmin.from('tollfree_applications').insert({
      business_name: business_name || null,
      website: site,
      contact_email,
      support_hours: support_hours || null,
      sample_messages: samples,
      opt_in_description: opt_in_description || null,
      user_agent: ua,
      ip_hash
    }).select('id').single();
    if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e:any) {
    return NextResponse.json({ error: 'unexpected', detail: e?.message }, { status: 500 });
  }
}
