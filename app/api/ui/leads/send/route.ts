import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTwilioClient, getTwilioSender } from '@/lib/twilio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Prefer server-only SUPABASE_URL, fall back to NEXT_PUBLIC for compatibility
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return NextResponse.json({ error: 'server_misconfigured', detail: 'Supabase env missing' }, { status: 500 });
    }

    const { lead_id, body } = await req.json().catch(() => ({}));
    if (!lead_id || !body || !String(body).trim()) {
      return NextResponse.json({ error: 'lead_id and body required' }, { status: 400 });
    }

    // Verify user via Supabase bearer token
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.substring(7) : '';
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = userRes.user.id;

    // Load lead and confirm the user has access to the account that owns this lead
    const { data: lead, error: leadErr } = await admin
      .from('leads')
      .select('id, account_id, phone, opted_out')
      .eq('id', lead_id)
      .maybeSingle();
    if (leadErr || !lead) return NextResponse.json({ error: 'lead_not_found' }, { status: 404 });

    const { data: ua } = await admin
      .from('user_accounts')
      .select('account_id')
      .eq('user_id', userId)
      .eq('account_id', (lead as any).account_id)
      .maybeSingle();
    if (!ua) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const phone: string = (lead as any).phone;
    if (!/^\+\d{8,15}$/.test(phone)) {
      return NextResponse.json({ error: 'invalid_phone', detail: 'Expect E.164 (e.g., +15551234567)' }, { status: 400 });
    }
    if ((lead as any).opted_out) {
      return NextResponse.json({ error: 'opted_out' }, { status: 409 });
    }

    // Compose text: support a simple "/initial" branch and ensure STOP footer
    const raw = String(body).trim();
    let text = raw === '/initial'
      ? "Hey—it’s OutboundRevive. Quick test of our AI SMS. Want a link to pick a time?"
      : raw;
    if (!/txt\s+stop\s+to\s+opt\s+out/i.test(text)) {
      text = `${text} Txt STOP to opt out`;
    }

    // 1) Insert queued row into messages_out (server-side service role bypasses RLS)
    let messageId: string | null = null;
    {
      const { data: ins, error: insErr } = await admin
        .from('messages_out')
        .insert({ lead_id, account_id: (lead as any).account_id, body: text, status: 'queued' } as any)
        .select('id')
        .maybeSingle();
      if (!insErr) messageId = ins?.id || null;
    }

    // 2) Send SMS via Twilio (Messaging Service preferred, else From number)
    const dryRun = (process.env.TWILIO_DISABLE || '0') === '1';
    let twilioSid = `SM_${Date.now().toString(36)}`;
    if (!dryRun) {
      try {
        const client = getTwilioClient();
        const sender = getTwilioSender();
        const res = await client.messages.create({
          to: phone,
          body: text,
          ...sender,
          statusCallback: `${(process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '')}/api/webhooks/twilio/status`
        });
        twilioSid = res.sid;
      } catch (e: any) {
        // Update queued row to failed if we created one
        if (messageId) {
          await admin.from('messages_out').update({ status: 'failed', error_code: e?.code || e?.message || 'twilio_send_failed' } as any).eq('id', messageId);
        }
        return NextResponse.json({ error: 'twilio_send_failed', detail: e?.message || String(e) }, { status: 502 });
      }
    }

    // 3) Mark sent
    if (messageId) {
      await admin
        .from('messages_out')
        .update({ status: dryRun ? 'queued' : 'sent', provider_sid: twilioSid } as any)
        .eq('id', messageId);

      // Optional: seed an initial deliverability event for tracing
      await admin.from('deliverability_events').insert({
        message_id: messageId,
        type: dryRun ? 'queued' : 'sent',
        meta_json: { initial: raw === '/initial', sid: twilioSid }
      } as any).then(() => {});
    }

    return NextResponse.json({ ok: true, lead_id, to: phone, message_out_id: messageId, sid: twilioSid, status: dryRun ? 'queued' : 'sent', dry_run: dryRun }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: 'unexpected', detail: e?.message || String(e) }, { status: 500 });
  }
}
