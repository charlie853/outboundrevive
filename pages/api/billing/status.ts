import type { NextApiRequest, NextApiResponse } from 'next';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL || !KEY) return res.status(500).json({ ok: false, error: 'Supabase env missing' });

  const accountId = (Array.isArray(req.query.account_id) ? req.query.account_id[0] : req.query.account_id) || process.env.DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111';
  try {
    const r = await fetch(`${URL}/rest/v1/tenant_billing?select=plan_tier,monthly_cap_segments,segments_used,warn_80_sent&account_id=eq.${encodeURIComponent(accountId)}&limit=1`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) return res.status(200).json({ ok: true, plan: null });
    const rows = await r.json().catch(() => []);
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    return res.status(200).json({ ok: true, ...row });
  } catch (e: any) {
    return res.status(200).json({ ok: true, plan: null, error: e?.message });
  }
}


