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
  let form: FormData;
  try { form = await req.formData(); } catch {
    console.error('[twilio/inbound] formData parse failed');
    return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
  }

  const From = normPhone(String(form.get('From') || ''));
  const To   = normPhone(String(form.get('To')   || ''));
  const Body = String(form.get('Body') || '').trim();

  console.log('[twilio/inbound] received', { From, To, Body });

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    console.log('[twilio/inbound] env present?', { url: !!supabaseUrl, srvKey: !!serviceKey });

    const supabase = createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from('messages_in')
      .insert({ from_phone: From || null, to_phone: To || null, body: Body || null })
      .select()
      .single();

    if (error) {
      console.error('[twilio/inbound] insert error', error);
    } else {
      console.log('[twilio/inbound] insert ok', data);
    }
  } catch (e) {
    console.error('[twilio/inbound] insert threw', e);
  }

  const msg = `Thanks! We received: ${Body} — we'll follow up shortly.`;
  const xml = `<Response><Message>${escapeXml(msg)}</Message></Response>`;
  return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml' } });
}
