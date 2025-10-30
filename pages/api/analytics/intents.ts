import type { NextApiRequest, NextApiResponse } from 'next';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function sinceISO(range: string | string[] | undefined) {
  const r = (Array.isArray(range) ? range[0] : range) || '7d';
  const now = Date.now();
  const days = r === '1d' ? 1 : r === '30d' ? 30 : 7;
  return new Date(now - days * 24 * 3600 * 1000).toISOString();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL || !KEY) return res.status(500).json({ ok: false, error: 'Supabase env missing' });

  const accountId = (Array.isArray(req.query.account_id) ? req.query.account_id[0] : req.query.account_id) || process.env.DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111';
  const since = sinceISO(req.query.range);
  try {
    const r = await fetch(`${URL}/rest/v1/messages_out?select=intent&account_id=eq.${encodeURIComponent(accountId)}&created_at=gte.${encodeURIComponent(since)}&intent=not.is.null`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) return res.status(200).json({ ok: true, intents: [] });
    const rows = await r.json().catch(() => []);
    const counts: Record<string, number> = {};
    for (const row of rows as Array<{ intent?: string }>) {
      const k = String(row.intent || '').trim() || 'unknown';
      counts[k] = (counts[k] || 0) + 1;
    }
    const intents = Object.entries(counts).map(([intent, count]) => ({ intent, count })).sort((a,b)=>b.count-a.count);
    return res.status(200).json({ ok: true, intents });
  } catch (e: any) {
    return res.status(200).json({ ok: true, intents: [], error: e?.message });
  }
}


