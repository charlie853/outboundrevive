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
  const tz = (Array.isArray(req.query.tz) ? req.query.tz[0] : req.query.tz) || 'America/New_York';

  try {
    // Fetch inbound messages in range
    const r = await fetch(`${URL}/rest/v1/messages_in?select=created_at&account_id=eq.${encodeURIComponent(accountId)}&created_at=gte.${encodeURIComponent(since)}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) return res.status(200).json({ ok: true, heatmap: [] });
    const rows = await r.json().catch(() => []);

    // Bucket by dow (0-6) × hour (0-23) in tenant TZ
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz as string, hour12: false, weekday: 'short', hour: '2-digit' });
    const buckets = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const row of rows as Array<{ created_at: string }>) {
      const d = new Date(row.created_at);
      const parts = fmt.formatToParts(d);
      const wd = parts.find(p => p.type === 'weekday')?.value || 'Sun';
      const hh = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
      const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wd);
      if (dow >= 0 && hh >= 0 && hh < 24) buckets[dow][hh] += 1;
    }

    return res.status(200).json({ ok: true, tz, since, heatmap: buckets });
  } catch (e: any) {
    return res.status(200).json({ ok: true, heatmap: [], error: e?.message });
  }
}


