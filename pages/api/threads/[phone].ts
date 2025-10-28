import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type MessageRow = {
  created_at?: string | null;
  body?: string | null;
  status?: string | null;
};

type LeadRow = {
  name?: string | null;
  phone?: string | null;
};

const buildHeaders = () => ({
  apikey: SERVICE_ROLE_KEY ?? '',
  Authorization: `Bearer ${SERVICE_ROLE_KEY ?? ''}`,
  accept: 'application/json',
});

async function fetchFromRest(path: string): Promise<unknown> {
  if (!SUPABASE_URL) throw new Error('Supabase URL missing');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: buildHeaders(),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || `REST ${response.status}`);
    }
    const payload = await response.json();
    return payload as unknown;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  const phone = String(req.query.phone || '').trim();
  if (!phone) {
    res.status(400).json({ ok: false, error: 'missing phone' });
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(200).json({ ok: false, error: 'Supabase env missing' });
    return;
  }

  const encPhone = encodeURIComponent(phone);
  const sharedFilter = `or=(from_phone.eq.${encPhone},to_phone.eq.${encPhone})`;
  const inboundPath = `messages_in?select=id,from_phone,to_phone,body,created_at&${sharedFilter}&order=created_at.asc&limit=200`;
  const outboundPath = `messages_out?select=id,from_phone,to_phone,body,status,created_at&${sharedFilter}&order=created_at.asc&limit=200`;
  const leadPath = `leads?phone=eq.${encPhone}&select=name,phone&limit=1`;

  try {
    const [inboundRows, outboundRows, leadRows] = await Promise.all([
      fetchFromRest(inboundPath),
      fetchFromRest(outboundPath),
      fetchFromRest(leadPath),
    ]);

    const inboundMessages = Array.isArray(inboundRows)
      ? inboundRows.map((raw) => {
          const row = raw as MessageRow;
          return {
            at: row?.created_at ?? '',
            dir: 'in' as const,
            body: row?.body ?? '',
          };
        })
      : [];

    const outboundMessages = Array.isArray(outboundRows)
      ? outboundRows.map((raw) => {
          const row = raw as MessageRow;
          return {
            at: row?.created_at ?? '',
            dir: 'out' as const,
            body: row?.body ?? '',
            status: row?.status ?? undefined,
          };
        })
      : [];

    const messages = [...inboundMessages, ...outboundMessages].sort((a, b) => {
      const aTime = a.at ? new Date(a.at).getTime() : 0;
      const bTime = b.at ? new Date(b.at).getTime() : 0;
      return aTime - bTime;
    });

    const lead = (Array.isArray(leadRows) && leadRows.length ? (leadRows[0] as LeadRow) : null) ?? null;
    const contact = {
      phone,
      name: lead?.name ?? phone,
    };

    res.status(200).json({ ok: true, contact, messages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'failed to load conversation';
    res.status(200).json({ ok: false, error: message || 'failed to load conversation' });
  }
}
