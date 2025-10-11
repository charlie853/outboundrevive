import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_API_KEY = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '')!;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
// Support either TWILIO_FROM (alias) or TWILIO_FROM_NUMBER
const TWILIO_FROM = (process.env.TWILIO_FROM || process.env.TWILIO_FROM_NUMBER || '') || undefined;
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_MESSAGING_SERVICE_SID as string | undefined;

export async function POST(req: NextRequest) {
  try {
    const adminKey = req.headers.get('x-admin-key') || req.headers.get('x-admin-token') || '';
    if (!ADMIN_API_KEY || adminKey !== ADMIN_API_KEY) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const { lead_id, body } = await req.json().catch(() => ({}));
    if (!lead_id || !body) {
      return NextResponse.json({ error: 'lead_id and body required' }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, phone')
      .eq('id', lead_id)
      .single();

    if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const args: Record<string, string> = { To: (lead as any).phone, Body: String(body) };
    if (TWILIO_MESSAGING_SERVICE_SID) args.MessagingServiceSid = TWILIO_MESSAGING_SERVICE_SID;
    else if (TWILIO_FROM) args.From = TWILIO_FROM;
    else return NextResponse.json({ error: 'Twilio FROM or Messaging Service not configured' }, { status: 500 });

    const sent = await client.messages.create(args);
    return NextResponse.json({ ok: true, twilio_sid: sent.sid });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected' }, { status: 500 });
  }
}

