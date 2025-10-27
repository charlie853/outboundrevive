import type { NextApiRequest, NextApiResponse } from 'next';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type ThreadRow = {
  lead_phone: string | null;
  lead_name: string | null;
  last_message: string | null;
  last_at: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (!URL || !KEY) {
    res.status(500).json({ ok: false, error: 'Supabase env missing' });
    return;
  }

  const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '20'), 10)));

  // We use just the leads table to build a threads list:
  // last_at = greatest(last_reply_at, last_sent_at)
  // last_message = last_reply_body if present
  // ordered by last_at desc, limit N
  const sql = `
    with t as (
      select
        phone as lead_phone,
        name  as lead_name,
        coalesce(last_reply_body, '') as last_message,
        greatest(
          coalesce(last_reply_at, 'epoch'::timestamptz),
          coalesce(last_sent_at,  'epoch'::timestamptz)
        ) as last_at
      from leads
    )
    select lead_phone, lead_name,
           nullif(last_message, '') as last_message,
           nullif(to_char(last_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '1970-01-01T00:00:00Z') as last_at
    from t
    where last_at is not null and last_at > 'epoch'
    order by last_at desc
    limit ${limit};
  `.trim();

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);
  try {
    const resSQL = await fetch(`${URL}/rest/v1/rpc/exec_sql`, {
      signal: ac.signal,
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    });

    if (!resSQL.ok) {
      const err = await resSQL.text().catch(() => '');
      res.status(200).json({ ok: true, threads: [] as ThreadRow[], note: `sql_error: ${err.slice(0,200)}` });
      return;
    }

    const rows: ThreadRow[] = await resSQL.json().catch(() => []);
    res.status(200).json({ ok: true, threads: rows ?? [] });
  } catch {
    res.status(200).json({ ok: true, threads: [] as ThreadRow[] });
  } finally {
    clearTimeout(t);
  }
}
