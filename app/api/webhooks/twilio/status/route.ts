import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const messageSid   = String(form.get('MessageSid') ?? '').trim();
    const messageStatus = String(form.get('MessageStatus') ?? '').trim().toLowerCase();
    const codeStr      = String(form.get('ErrorCode') ?? '').trim();
    const errorCode    = codeStr === '' ? null : Number(codeStr);

    if (!messageSid) return new NextResponse(null, { status: 200 });

    // 1) Update messages_out if you have it
    await supabaseAdmin
      .from('messages_out')
      .update({ status: messageStatus || null, error_code: errorCode })
      .eq('provider_sid', messageSid);

    // 2) Update leads by last_message_sid (your UI reads from here)
    const { error: updErr } = await supabaseAdmin
      .from('leads')
      .update({ delivery_status: messageStatus || null, error_code: errorCode })
      .eq('last_message_sid', messageSid);

    if (updErr) console.error('[STATUS] leads update error:', updErr);

    // 3) (Optional) keep a deliverability trail
    await supabaseAdmin.from('deliverability_events').insert({
      message_id: null,
      type: messageStatus || 'unknown',
      meta_json: { messageSid, errorCode },
    });

    return new NextResponse(null, { status: 200 });
  } catch (e) {
    console.error('[STATUS] Handler exception:', e);
    return new NextResponse(null, { status: 200 });
  }
}