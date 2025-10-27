import type { NextApiRequest, NextApiResponse } from 'next';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type LeadRow = {
  phone: string | null;
  name: string | null;
  last_reply_body: string | null;
  last_reply_at: string | null;
  last_sent_at: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (!URL || !KEY) {
    res.status(500).json({ ok: false, error: 'Supabase env missing' });
    return;
  }

  const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? '20'), 10)));

  // Pull rows that have either a reply or a send timestamp.
  // Order by reply desc then send desc; we’ll compute a final lastAt in code.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const qs = new URLSearchParams({
      select: 'phone,name,last_reply_body,last_reply_at,last_sent_at',
      or: '(last_reply_at.not.is.null,last_sent_at.not.is.null)',
      order: 'last_reply_at.desc.nullslast,last_sent_at.desc.nullslast',
      limit: String(limit * 3), // fetch a few extra, we’ll de-dup in code
    });

    const r = await fetch(`${URL}/rest/v1/leads?${qs.toString()}`, {
      signal: ac.signal,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Prefer: 'count=exact',
      },
    });

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      res.status(200).json({ ok: true, threads: [], note: `rest_error: ${text.slice(0,200)}` });
      return;
    }

    const rows: LeadRow[] = await r.json().catch(() => []);
    // Map to thread objects; keep both snakeCase and camelCase to satisfy any UI shape.
    const byPhone = new Map<string, any>();
    for (const row of rows) {
      const phone = row.phone ?? '';
      if (!phone) continue;

      const lastReplyAt = row.last_reply_at ? Date.parse(row.last_reply_at) : 0;
      const lastSentAt  = row.last_sent_at  ? Date.parse(row.last_sent_at)  : 0;
      const lastAtMs = Math.max(lastReplyAt, lastSentAt);
      const lastAtISO = lastAtMs > 0 ? new Date(lastAtMs).toISOString() : null;

      // Keep the newest per phone
      const existing = byPhone.get(phone);
      if (!existing || (existing.lastAtMs ?? 0) < lastAtMs) {
        byPhone.set(phone, {
          // canonical
          phone,
          name: row.name ?? null,
          lastMessage: row.last_reply_body ?? null,
          lastAt: lastAtISO,
          // aliases (in case UI expects these)
          lead_phone: phone,
          lead_name: row.name ?? null,
          last_message: row.last_reply_body ?? null,
          last_at: lastAtISO,
          lastAtMs,
        });
      }
    }

    // Sort by lastAt desc and trim to limit
    const threads = Array.from(byPhone.values())
      .sort((a, b) => (b.lastAtMs ?? 0) - (a.lastAtMs ?? 0))
      .slice(0, limit)
      .map(({ lastAtMs, ...t }) => t);

    res.status(200).json({ ok: true, threads });
  } catch {
    res.status(200).json({ ok: true, threads: [] });
  } finally {
    clearTimeout(timer);
  }
}
