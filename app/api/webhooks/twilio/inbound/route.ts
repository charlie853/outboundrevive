export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const form = await req.formData();
  const From = String(form.get('From') || '');
  const To   = String(form.get('To')   || '');
  const Body = String(form.get('Body') || '');

  const supa = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Minimal: log inbound (adjust columns to your schema)
  try {
    await supa.from('messages_in').insert({
      from_phone: From,
      to_phone: To,
      body: Body
    });
  } catch (e) {
    console.error('[twilio/inbound] insert error', e);
  }

  // IMPORTANT: don't send a <Message> here—return empty TwiML and let your app send replies itself
  return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } });
}
