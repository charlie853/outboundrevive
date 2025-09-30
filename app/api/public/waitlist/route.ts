import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { checkRateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const allowed = await checkRateLimit(req.headers, 'public:waitlist', 5, 60);
    if (!allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

    const { email, source, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, hp } = await req.json().catch(() => ({}));
    if (hp && String(hp).trim() !== '') return NextResponse.json({ ok: true }); // honeypot
    const em = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.ip || null;
    const ua = req.headers.get('user-agent') || null;

    const { error } = await supabaseAdmin.from('site_waitlist').insert({
      email: em,
      source: source || null,
      ip,
      user_agent: ua,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_content: utm_content || null,
      utm_term: utm_term || null,
      referrer: referrer || null,
    });
    if (error && !String(error.message).includes('duplicate')) {
      return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
    }
    // Optional: send a lightweight thanks email if configured
    try {
      const resend = (process.env.RESEND_API_KEY || '').trim();
      const postmark = (process.env.POSTMARK_TOKEN || '').trim();
      if (resend) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resend}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'OutboundRevive <noreply@outboundrevive.com>', to: em, subject: 'You\'re on the list', html: '<p>Thanks for joining the waitlist — we\'ll be in touch.</p>' })
        }).catch(()=>{});
      } else if (postmark) {
        await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: { 'X-Postmark-Server-Token': postmark, 'Content-Type': 'application/json' },
          body: JSON.stringify({ From: 'noreply@outboundrevive.com', To: em, Subject: 'You\'re on the list', HtmlBody: '<p>Thanks for joining the waitlist — we\'ll be in touch.</p>' })
        }).catch(()=>{});
      }
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'unexpected', detail: e?.message }, { status: 500 });
  }
}
