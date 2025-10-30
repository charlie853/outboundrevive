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
    // Pull provider error codes and to_phone numbers
    const r = await fetch(`${URL}/rest/v1/messages_out?select=to_phone,provider_status,provider_error_code&account_id=eq.${encodeURIComponent(accountId)}&created_at=gte.${encodeURIComponent(since)}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) return res.status(200).json({ ok: true, breakdown: [], errors: [] });
    const rows = await r.json().catch(() => []);

    const carrierFromNpa = (phone?: string | null) => {
      // Placeholder: map by area code; real carrier requires provider webhooks or CNAM API
      const m = typeof phone === 'string' ? phone.match(/^\+1(\d{3})\d{7}$/) : null;
      const npa = m ? m[1] : null;
      if (!npa) return 'unknown';
      // group by state-ish buckets
      const FL = new Set(['239','305','321','352','386','407','561','689','727','754','772','786','813','850','863','904','941','954']);
      const OK = new Set(['405','539','572','580','918']);
      if (FL.has(npa)) return 'FL';
      if (OK.has(npa)) return 'OK';
      return 'US';
    };

    const breakdown: Record<string, { sent: number; delivered: number; failed: number }> = {};
    const errors: Record<string, number> = {};
    for (const row of rows as Array<{ to_phone?: string; provider_status?: string; provider_error_code?: string }>) {
      const key = carrierFromNpa(row.to_phone);
      breakdown[key] = breakdown[key] || { sent: 0, delivered: 0, failed: 0 };
      const s = (row.provider_status || '').toLowerCase();
      if (s === 'delivered') breakdown[key].delivered++;
      else if (s === 'failed' || s === 'undelivered') { breakdown[key].failed++; if (row.provider_error_code) errors[row.provider_error_code] = (errors[row.provider_error_code] || 0) + 1; }
      else breakdown[key].sent++;
    }

    const breakdownArr = Object.entries(breakdown).map(([k, v]) => ({ region: k, ...v }));
    const errorsArr = Object.entries(errors).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count).slice(0, 20);
    return res.status(200).json({ ok: true, since, breakdown: breakdownArr, errors: errorsArr });
  } catch (e: any) {
    return res.status(200).json({ ok: true, breakdown: [], errors: [], error: e?.message });
  }
}


