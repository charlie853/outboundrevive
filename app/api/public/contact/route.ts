import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { checkRateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const allowed = await checkRateLimit(req.headers, 'public:contact', 3, 60);
    if (!allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

    const { name, email, message, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, hp } = await req.json().catch(() => ({}));
    if (hp && String(hp).trim() !== '') return NextResponse.json({ ok: true });
    const em = String(email || '').trim().toLowerCase();
    const msg = String(message || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
    if (!msg || msg.length > 4000) return NextResponse.json({ error: 'message_required' }, { status: 400 });

    const { error } = await supabaseAdmin.from('site_contacts').insert({
      name: name || null,
      email: em,
      message: msg,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
      utm_content: utm_content || null,
      utm_term: utm_term || null,
      referrer: referrer || null,
    });
    if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
    // Optional: email notification (Resend/Postmark)
    try {
      const resend = (process.env.RESEND_API_KEY || '').trim();
      const postmark = (process.env.POSTMARK_TOKEN || '').trim();
      const bodyHtml = `<p>Contact from site</p><p><b>Name:</b> ${name || ''}</p><p><b>Email:</b> ${em}</p><p><b>Message:</b><br/>${msg.replace(/</g,'&lt;')}</p>`;
      if (resend) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resend}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'OutboundRevive <noreply@outboundrevive.com>', to: 'support@outboundrevive.com', subject: 'New contact', html: bodyHtml })
        }).catch(()=>{});
        // Auto-reply
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resend}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'OutboundRevive <noreply@outboundrevive.com>', to: em, subject: 'We received your message', html: '<p>Thanks—our team will follow up shortly.</p>' })
        }).catch(()=>{});
      } else if (postmark) {
        await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: { 'X-Postmark-Server-Token': postmark, 'Content-Type': 'application/json' },
          body: JSON.stringify({ From: 'noreply@outboundrevive.com', To: 'support@outboundrevive.com', Subject: 'New contact', HtmlBody: bodyHtml })
        }).catch(()=>{});
        await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: { 'X-Postmark-Server-Token': postmark, 'Content-Type': 'application/json' },
          body: JSON.stringify({ From: 'noreply@outboundrevive.com', To: em, Subject: 'We received your message', HtmlBody: '<p>Thanks—our team will follow up shortly.</p>' })
        }).catch(()=>{});
      }
    } catch {}

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'unexpected', detail: e?.message }, { status: 500 });
  }
}
