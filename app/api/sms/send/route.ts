import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export const runtime = 'nodejs';

function ensureCompliant(body: string) {
  const t = body.trim();
  if (t.length > 160) throw new Error('Message exceeds 160 characters');
  if (!/txt stop to opt out/i.test(t)) throw new Error('Message must include "Txt STOP to opt out"');
  return t;
}

export async function POST(req: NextRequest) {
  try {
    const { leadIds, message, brand } = await req.json() as {
      leadIds: string[];
      message: string;
      brand?: string;
    };

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'No leads selected' }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    const { data: leads, error } = await supabase
      .from('leads')
      .select('id,name,phone,opted_out')
      .in('id', leadIds);

    if (error) {
      console.error('DB fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
    }

    const results: Array<{ id: string; phone: string; sid?: string; error?: string }> = [];
    const dryRun = process.env.TWILIO_DISABLE === '1';

    for (const l of leads || []) {
      try {
        if (l.opted_out) {
          results.push({ id: l.id, phone: l.phone, error: 'opted_out' });
          continue;
        }

        const rendered =
          message
            .replaceAll('{{name}}', l.name || '')
            .replaceAll('{{brand}}', brand || 'OutboundRevive');

        const body = ensureCompliant(rendered);

        // Dry-run: pretend Twilio send succeeded
        const fakeSid = 'SIM' + Math.random().toString(36).slice(2, 14).toUpperCase();

        if (dryRun) {
          await supabase
            .from('leads')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              last_message_sid: fakeSid,
              delivery_status: 'sent'
            })
            .eq('id', l.id);

          results.push({ id: l.id, phone: l.phone, sid: fakeSid });
          continue;
        }

        // (If you later remove dry-run, paste the real Twilio call here.)

      } catch (e: any) {
        console.error('Send error for', l?.phone, e?.message || e);
        results.push({ id: l?.id, phone: l?.phone, error: e?.message || 'send failed' });
      }
    }

    return NextResponse.json({ results });
  } catch (e: any) {
    console.error('POST /api/sms/send error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}