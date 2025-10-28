import type { NextApiRequest, NextApiResponse } from 'next';

export const config = { api: { bodyParser: true } };

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEFAULT_ACCOUNT_ID =
  process.env.DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111';

const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

function normPhone(s: string) {
  return (s || '').toString().trim().replace(/\r|\n/g, '');
}
function escapeXml(s: string) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function publicBase(req: NextApiRequest) {
  return (
    process.env.PUBLIC_BASE_URL ||
    (req.headers['x-forwarded-host']
      ? `https://${req.headers['x-forwarded-host']}`
      : `https://${process.env.VERCEL_URL}`)
  );
}
async function fetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const fromRaw = normPhone((req.body as any)?.From);
  const toRaw = normPhone((req.body as any)?.To);
  const text = ((req.body as any)?.Body ?? '').toString();

  const toLast10 = toRaw.replace(/\D/g, '').slice(-10);

  const q = new URL(`${SB_URL}/rest/v1/account_settings`);
  q.searchParams.set('select', '*');
  q.searchParams.set('limit', '1');
  q.searchParams.set('or', `(phone_from.eq.${toRaw},phone_from.ilike.*${toLast10})`);

  const settingsArr = await fetchJson(q.toString(), { headers: SB_HEADERS }).catch(() => []);
  const settings = Array.isArray(settingsArr) ? settingsArr[0] : undefined;

  const account_id = settings?.account_id ?? DEFAULT_ACCOUNT_ID;
  const enabled = !!settings?.autotexter_enabled;

  const insIn = await fetch(`${SB_URL}/rest/v1/messages_in`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'return=representation' },
    body: JSON.stringify([{ account_id, from_phone: fromRaw, to_phone: toRaw, body: text, processed: false }]),
  });
  const [inMsg] = insIn.ok ? await insIn.json() : [];
  const inboundId = inMsg?.id;


  if (enabled) {
    try {
      const draftUrl = `${publicBase(req)}/api/internal/knowledge/draft`;

      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), 6000);

      const draftRes = await fetch(draftUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          account_id,
          channel: 'sms',
          from: fromRaw,
          to: toRaw,
          text,
        }),
        signal: ac.signal,
      }).finally(() => clearTimeout(tid));

      if (draftRes.ok) {
        const dj = await draftRes.json().catch(() => ({} as any));
        replyText = dj?.text || dj?.draft || dj?.message || replyText;
      }
    } catch {
      // keep fallback
    }
  }

  if (inboundId) {
    await fetch(`${SB_URL}/rest/v1/messages_in?id=eq.${inboundId}`, {
      method: 'PATCH',
      headers: SB_HEADERS,
      body: JSON.stringify({ processed: true }),
    }).catch(() => {});
  }
  await fetch(`${SB_URL}/rest/v1/messages_out`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify([{ account_id, from_phone: toRaw, to_phone: fromRaw, body: replyText, status: 'twiml_sent' }]),
  }).catch(() => {});

  res.setHeader('Content-Type', 'text/xml');
  res
    .status(200)
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(
        replyText,
      )}</Message></Response>`,
    );
}
