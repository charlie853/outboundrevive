import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN!;
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

// Dummy LLM adapter hook you already have – call into your existing AI logic here
async function generateAIReply(_prompt: string): Promise<string> {
  // TODO: wire up your existing responder. For now, a safe placeholder:
  return "Great question — pricing starts at $X for Y seats. Want me to send a quick proposal?";
}

async function sendSms(from: string, to: string, body: string): Promise<{sid?: string, ok: boolean}> {
  const payload = new URLSearchParams();
  payload.set('To', to);
  payload.set('From', from);
  payload.set('Body', body);

  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64') },
    body: payload
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, sid: j?.sid };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 0) Is autotexter enabled?
    const settingsRes = await fetch(`${SUPABASE_URL}/rest/v1/account_settings?account_id=eq.${ACCOUNT_ID}&select=autotexter_enabled,phone_from,brand&limit=1`, {
      headers: { apikey: SRK, Authorization: `Bearer ${SRK}` }
    });
    const [settings] = await settingsRes.json().catch(() => []);
    if (!settings?.autotexter_enabled) return res.status(200).json({ ok: true, attempted: 0, sent: 0, note: 'disabled' });

    const phone_from: string = (settings?.phone_from || '').trim();
    const brand: string = settings?.brand || 'OutboundRevive';

    // 1) Grab up to N newest unprocessed inbound for this account
    const q = `${SUPABASE_URL}/rest/v1/messages_in?account_id=eq.${ACCOUNT_ID}&processed=eq.false&order=created_at.desc&limit=5`;
    const inboxRes = await fetch(q, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } });
    const inbox: Array<{ id: string, from_phone: string, body: string }> = await inboxRes.json().catch(() => []);

    let attempted = 0, sent = 0;

    for (const m of inbox) {
      attempted++;

      // 2) Generate reply with your existing AI logic (plug your library/prompt here)
      const prompt = `[${brand}] Lead: ${m.from_phone}\nMessage: ${m.body}\n\nReply politely, concise, include pricing path if asked.`;
      const reply = await generateAIReply(prompt);

      // 3) Send via Twilio
      const out = await sendSms(phone_from, m.from_phone, reply);
      const delivered = out.ok;

      // 4) Write to messages_out
      await fetch(`${SUPABASE_URL}/rest/v1/messages_out`, {
        method: 'POST',
        headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([{ account_id: ACCOUNT_ID, to_phone: m.from_phone, from_phone: phone_from, body: reply, status: delivered ? 'sent' : 'failed' }])
      });

      // 5) Mark inbound as processed
      await fetch(`${SUPABASE_URL}/rest/v1/messages_in?id=eq.${m.id}`, {
        method: 'PATCH',
        headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ processed: true })
      });
      if (delivered) sent++;
    }

    res.status(200).json({ ok: true, attempted, sent, brand, from: phone_from });
  } catch (e: any) {
    res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
