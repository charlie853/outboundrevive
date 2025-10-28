import type { NextApiRequest, NextApiResponse } from 'next';

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

const sbHeaders = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

// ---- replace this with YOUR LLM hook later ----
function composeReplySimple(text: string, brand = 'OutboundRevive') {
  const t = text.toLowerCase();
  if (t.includes('price') || t.includes('pricing') || t.includes('cost')) {
    return `${brand}: Most plans start around $499/mo depending on volume and channels. Want a 2-min overview or a quick call link?`;
  }
  if (t.includes('botox') || t.includes('appointment') || t.includes('book')) {
    return `${brand}: I can share availability and next steps. Do you prefer mornings or afternoons this week?`;
  }
  return `${brand}: Got it—happy to help. What’s the main goal so I can tailor next steps?`;
}
// -----------------------------------------------

async function sendViaTwilio(to: string, from: string, body: string) {
  if (!TWILIO_SID || !TWILIO_TOKEN) throw new Error('Missing TWILIO creds');
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const form = new URLSearchParams({ To: to, From: from.trim(), Body: body });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const j = await r.json();
  return { ok: r.ok, sid: j.sid, status: j.status, error: j.message };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    // optional hints from webhook: { account_id, from, to, mode }
    const hint = (req.body || {}) as { account_id?: string; from?: string; to?: string; mode?: string };

    // 1) Resolve account settings (by "to" if provided, else take first configured account)
    let set: any | undefined;
    {
      const u = new URL(`${SB_URL}/rest/v1/account_settings`);
      u.searchParams.set('select', '*');
      if (hint.to) u.searchParams.set('phone_from', `eq.${hint.to.trim()}`);
      u.searchParams.set('order', 'updated_at.desc');
      u.searchParams.set('limit', '1');

      const r = await fetch(u.toString(), { headers: sbHeaders });
      const arr = r.ok ? await r.json() : [];
      set = arr?.[0];
    }

    if (!set?.account_id) {
      return res.status(200).json({ ok: false, error: 'No matching account settings for this number' });
    }

    const account_id: string = set.account_id;
    const phone_from: string = (set.phone_from || '').trim();
    const brand: string = set.brand || 'OutboundRevive';
    const enabled: boolean = !!set.autotexter_enabled;

    if (!enabled) return res.status(200).json({ ok: true, skipped: 'autotexter_disabled' });
    if (!phone_from) return res.status(200).json({ ok: false, error: 'No phone_from configured' });

    // 2) Load the latest inbound/outbound for recent context
    const [rIn, rOut] = await Promise.all([
      fetch(`${SB_URL}/rest/v1/messages_in?account_id=eq.${account_id}&select=from_phone,to_phone,body,created_at&order=created_at.desc&limit=50`, { headers: sbHeaders }),
      fetch(`${SB_URL}/rest/v1/messages_out?account_id=eq.${account_id}&select=to_phone,from_phone,body,created_at&order=created_at.desc&limit=50`, { headers: sbHeaders }),
    ]);
    const ins: Array<any> = rIn.ok ? await rIn.json() : [];
    const outs: Array<any> = rOut.ok ? await rOut.json() : [];

    // Reduce to candidates: last inbound newer than last outbound per (from_phone)
    const lastOutByPhone = new Map<string, number>();
    for (const m of outs) {
      const k = String(m.to_phone).trim();
      const t = new Date(m.created_at).getTime();
      if (!lastOutByPhone.has(k) || t > (lastOutByPhone.get(k) || 0)) lastOutByPhone.set(k, t);
    }

    const seen = new Set<string>();
    const candidates: Array<{ to: string; from: string; text: string }> = [];
    for (const m of ins) {
      const from = String(m.from_phone).trim();
      if (hint.from && from !== hint.from) continue; // if targeted
      if (seen.has(from)) continue;
      seen.add(from);

      const inboundAt = new Date(m.created_at).getTime();
      const lastOutAt = lastOutByPhone.get(from) || 0;
      if (inboundAt > lastOutAt) {
        candidates.push({ to: from, from: phone_from, text: String(m.body || '') });
      }
    }

    let attempted = 0, sent = 0;
    for (const c of candidates) {
      attempted++;

      // 3) Compose reply (swap this with your LLM function)
      const reply = composeReplySimple(c.text, brand);

      // 4) Insert messages_out (queued) so your dashboard shows intent
      const created_at = new Date().toISOString();
      await fetch(`${SB_URL}/rest/v1/messages_out`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify([{ account_id, from_phone: c.from, to_phone: c.to, body: reply, status: 'queued', created_at }]),
      });

      // 5) Send via Twilio
      const tw = await sendViaTwilio(c.to, c.from, reply);
      const finalStatus = tw.ok ? (tw.status || 'sent') : 'failed';

      // 6) Update to delivered/failed
      await fetch(`${SB_URL}/rest/v1/messages_out?account_id=eq.${account_id}&to_phone=eq.${encodeURIComponent(c.to)}&created_at=eq.${encodeURIComponent(created_at)}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ status: finalStatus }),
      });

      if (tw.ok) sent++;
    }

    return res.status(200).json({ ok: true, attempted, sent });
  } catch (e: any) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
