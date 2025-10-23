export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function normPhone(p: string) {
  if (!p) return '';
  const digits = p.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  return '+1' + digits.replace(/^1*/, '');
}

function escapeXml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export async function POST(req: NextRequest) {
  // Twilio posts form-encoded
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
  }

  const From = normPhone(String(form.get('From') || ''));
  const To   = normPhone(String(form.get('To')   || ''));
  const Body = String(form.get('Body') || '').trim();

  // Log inbound to Supabase (service role)
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await supabase.from('messages_in').insert({
      from_phone: From || null,
      to_phone: To || null,
      body: Body || null,
    });
  } catch (e) {
    console.error('[twilio/inbound] insert messages_in failed', e);
  }

  // Simple TwiML auto-reply (Twilio will send this SMS back)
  const msg = `Thanks! We received: ${Body} — we'll follow up shortly.`;
  const xml = `<Response><Message>${escapeXml(msg)}</Message></Response>`;
  return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } });
}
