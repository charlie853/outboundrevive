import { sendSms } from '@/lib/twilio';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_API_KEY_SID = process.env.TWILIO_API_KEY_SID!;
const TWILIO_API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET!;
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID!;
const TWILIO_DISABLE = process.env.TWILIO_DISABLE ?? '0';


/** Verify Supabase user from a Bearer token */
async function requireUser(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { ok: false as const, status: 401, error: 'missing bearer token' };

  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    cache: 'no-store',
  });

  if (!r.ok) return { ok: false as const, status: 401, error: 'invalid token' };
  const user = await r.json();
  return { ok: true as const, user };
}

/** POST body shape */
type SendBody = {
  lead_id?: string;
  body?: string;
};

export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/ui/leads/send', method: 'GET' });
}

export async function POST(req: NextRequest) {
  try {
    // 1) Auth
    const auth = await requireUser(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // 2) Parse & validate
    const json = (await req.json()) as SendBody;
    const lead_id = json.lead_id?.trim();
    let text = (json.body ?? '').toString();

    if (!lead_id || !text) {
      return NextResponse.json({ error: 'lead_id and body are required' }, { status: 400 });
    }

    // Allow a quick trigger string for initial outreach
    if (text === '/initial') {
      // You can swap this for a generator that pulls account_settings prompts.
      text =
        "Hey—it’s Charlie from OutboundRevive. Quick test of our AI SMS. Want a link to pick a time? Txt STOP to opt out";
    }

    // 3) Load the lead (need the phone)
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('leads')
      .select('id, phone, account_id')
      .eq('id', lead_id)
      .single();

    if (leadErr || !lead?.phone) {
      return NextResponse.json({ error: 'lead not found or missing phone' }, { status: 404 });
    }

    // 4) Insert messages_out as queued
    const { data: msg, error: msgErr } = await supabaseAdmin
      .from('messages_out')
      .insert({
        lead_id: lead.id,
        account_id: lead.account_id ?? null,
        body: text,
        provider: 'twilio',
        status: TWILIO_DISABLE === '1' ? 'dry' : 'queued',
      })
      .select('id')
      .single();

    if (msgErr || !msg?.id) {
      return NextResponse.json({ error: 'failed to insert message' }, { status: 500 });
    }

    // 5) Optionally short-circuit in dry-run
    if (TWILIO_DISABLE === '1') {
      return NextResponse.json({ ok: true, dry: true, message_id: msg.id, body: text });
    }

    // 6) Send via Twilio helper (Messaging Service only)
    const base = (process.env.PUBLIC_BASE || process.env.PUBLIC_BASE_URL || '').trim();
    const twJson: any = await sendSms({
      to: lead.phone,
      body: text,
      statusCallback: base ? `${base}/api/webhooks/twilio/status` : undefined,
    });

    // 7) Persist Twilio result
    if (twJson?.sid) {
      await supabaseAdmin
        .from('messages_out')
        .update({
          provider_sid: twJson.sid,
          status: twJson.status ?? 'queued',
        })
        .eq('id', msg.id);
      return NextResponse.json({ ok: true, sid: twJson.sid, status: twJson.status ?? 'queued' });
    } else {
      await supabaseAdmin
        .from('messages_out')
        .update({
          status: 'failed',
          error_code: twJson?.error_code ?? twJson?.message ?? null,
        })
        .eq('id', msg.id);

      return NextResponse.json(
        { error: 'twilio send failed', detail: twJson },
        { status: 502 }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: 'unhandled error', detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
