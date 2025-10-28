import type { NextApiRequest, NextApiResponse } from 'next';

export const config = { api: { bodyParser: true } };

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111';

const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

function norm(s: string | undefined) {
  return (s || '').toString().trim().replace(/\r|\n/g, '');
}
function last10(phone: string) {
  return (phone || '').replace(/\D/g, '').slice(-10);
}
function escapeXml(s: string) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function publicBase(req: NextApiRequest) {
  const host = (req.headers['x-forwarded-host'] || '').toString();
  const vercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
  return process.env.PUBLIC_BASE_URL || (host ? `https://${host}` : vercel);
}

async function selectSettingsByTo(toRaw: string) {
  try {
    const or = `(phone_from.eq.${encodeURIComponent(toRaw)},phone_from.ilike.*${encodeURIComponent(last10(toRaw))})`;
    const url = new URL(`${SB_URL}/rest/v1/account_settings`);
    url.searchParams.set('select', 'account_id,autotexter_enabled,phone_from,brand');
    url.searchParams.set('limit', '1');
    url.searchParams.set('or', or);
    const r = await fetch(url.toString(), { headers: SB_HEADERS });
    if (!r.ok) throw new Error(`settings ${r.status}`);
    const arr = await r.json().catch(() => []);
    return Array.isArray(arr) && arr[0] ? arr[0] : null;
  } catch (e) {
    console.error('settings-error', e);
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const fromRaw = norm((req.body as any)?.From);
  const toRaw = norm((req.body as any)?.To);
  const text = ((req.body as any)?.Body ?? '').toString();

  let replyText = 'Thanks—message received.';
  let inboundId: string | undefined;

  try {
    const st = await selectSettingsByTo(toRaw);
    const account_id = st?.account_id || DEFAULT_ACCOUNT_ID;
    const enabled = !!st?.autotexter_enabled;

    try {
      const ins = await fetch(`${SB_URL}/rest/v1/messages_in`, {
        method: 'POST',
        headers: { ...SB_HEADERS, Prefer: 'return=representation' },
        body: JSON.stringify([{ account_id, from_phone: fromRaw, to_phone: toRaw, body: text, processed: false }]),
      });
      if (ins.ok) {
        const [row] = await ins.json();
        inboundId = row?.id;
      } else {
        console.error('insert-inbound-failed', await ins.text());
      }
    } catch (e) {
      console.error('insert-inbound-error', e);
    }

    if (enabled) {
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 6000);
        const r = await fetch(`${publicBase(req)}/api/internal/knowledge/draft`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ account_id, channel: 'sms', from: fromRaw, to: toRaw, text }),
          signal: ac.signal,
        });
        clearTimeout(t);
        if (r.ok) {
          const dj = await r.json().catch(() => ({} as any));
          const drafted = dj?.text || dj?.draft || dj?.message || '';
          if (drafted.trim()) replyText = drafted.trim();
        } else {
          console.error('draft-nok', r.status, await r.text().catch(() => ''));
        }
      } catch (e) {
        console.error('draft-error', e);
      }
    }

    if (inboundId) {
      fetch(`${SB_URL}/rest/v1/messages_in?id=eq.${inboundId}`, {
        method: 'PATCH',
        headers: SB_HEADERS,
        body: JSON.stringify({ processed: true }),
      }).catch((e) => console.error('mark-processed-error', e));
    }
    fetch(`${SB_URL}/rest/v1/messages_out`, {
      method: 'POST',
      headers: SB_HEADERS,
      body: JSON.stringify([{ account_id, from_phone: toRaw, to_phone: fromRaw, body: replyText, status: 'queued' }]),
    }).catch((e) => console.error('insert-outbound-error', e));

    res.setHeader('Content-Type', 'text/xml');
    res
      .status(200)
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(
          replyText,
        )}</Message></Response>`,
      );
  } catch (e) {
    console.error('webhook-fatal', e);
    res.setHeader('Content-Type', 'text/xml');
    res
      .status(200)
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(
          replyText,
        )}</Message></Response>`,
      );
  }
}
