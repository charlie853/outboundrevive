import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';

export const runtime = 'nodejs';

function detectIntent(body: string) {
  const t = (body || '').trim().toUpperCase();
  if (/^STOP\b/.test(t)) return 'STOP';
  if (/\bYES\b/.test(t)) return 'YES';
  if (/RESCHED|RESLOT|RESCHEDULE/.test(t)) return 'RESCHEDULE';
  if (/\bNO\b/.test(t)) return 'NO';
  return 'OTHER';
}

const xml = (s: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${s}</Message></Response>`;
const stopConfirm = xml(
  'You have successfully been unsubscribed. You will not receive any more messages. Reply START to re-subscribe.'
);

export async function POST(req: NextRequest) {
  try {
    // Ensure we're actually receiving form data
    const ctype = req.headers.get('content-type') || '';
    console.log('[INBOUND] Content-Type:', ctype);

    const form = await req.formData();
    // Some shells swallow + unless urlencoded; log raw values
    const from = String(form.get('From') ?? '');
    const body = String(form.get('Body') ?? '');
    const sid  = String(form.get('MessageSid') ?? '');
    console.log('[INBOUND] hit. From:', from, 'Body:', body, 'Sid:', sid);

    if (!from) {
      console.error('[INBOUND] Missing From');
      return new NextResponse('', { status: 204 });
    }

    // Look up the lead by exact phone match
    const { data: leads, error: selErr } = await supabaseAdmin
      .from('leads')
      .select('id,phone,opted_out,replied,intent')
      .eq('phone', from)
      .limit(1);

    if (selErr) {
      console.error('[INBOUND] Select error:', selErr);
      return new NextResponse('', { status: 204 });
    }

    console.log('[INBOUND] leads found:', leads?.length || 0);
    const lead = leads?.[0];
    if (!lead) {
      console.warn('[INBOUND] No matching lead for phone:', from);
      return new NextResponse('', { status: 204 });
    }

    const intent = detectIntent(body);

    if (intent === 'STOP') {
      const { error: updErr } = await supabaseAdmin
        .from('leads')
        .update({
          opted_out: true,
          intent: 'STOP',
          last_reply_at: new Date().toISOString(),
          last_reply_body: body
        })
        .eq('id', lead.id);

      if (updErr) {
        console.error('[INBOUND] STOP update error:', updErr);
        return new NextResponse('', { status: 204 });
      }

      console.log('[INBOUND] STOP set for lead:', lead.id);
      return new NextResponse(stopConfirm, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    const updatePayload: Record<string, any> = {
      intent,
      last_reply_at: new Date().toISOString(),
      last_reply_body: body
    };
    if (intent === 'YES') updatePayload.replied = true;

    const { error: updErr2 } = await supabaseAdmin
      .from('leads')
      .update(updatePayload)
      .eq('id', lead.id);

    if (updErr2) {
      console.error('[INBOUND] Update error:', updErr2);
      return new NextResponse('', { status: 204 });
    }

    console.log('[INBOUND] Updated lead:', lead.id, 'intent:', intent);
    return new NextResponse('', { status: 204 });
  } catch (e) {
    console.error('[INBOUND] Handler exception:', e);
    return new NextResponse('', { status: 204 });
  }
}