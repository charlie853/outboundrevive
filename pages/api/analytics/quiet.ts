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
    const r = await fetch(`${URL}/rest/v1/deliverability_events?select=created_at,type,meta_json&account_id=eq.${encodeURIComponent(accountId)}&type=eq.quiet_block&created_at=gte.${encodeURIComponent(since)}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) return res.status(200).json({ ok: true, count: 0, items: [] });
    const rows = await r.json().catch(() => []);
    return res.status(200).json({ ok: true, count: Array.isArray(rows) ? rows.length : 0, items: rows });
  } catch (e: any) {
    return res.status(200).json({ ok: true, count: 0, items: [], error: e?.message });
  }
}


