import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type MessageRow = {
  id: string;
  created_at?: string | null;
  body?: string | null;
  status?: string | null;
  lead_id?: string | null;
};

type LeadRow = {
  id?: string | null;
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

/**
 * Threads reliability fix:
 * - Query by lead_id, not phone columns (which don't exist on messages_out)
 * - Normalize phone to E.164 format (+1...)
 * - Use proper ordering with id as tiebreaker for same-second messages
 * - UNION ALL inbound and outbound for complete conversation
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  let phone = String(req.query.phone || '').trim();
  if (!phone) {
    res.status(400).json({ ok: false, error: 'missing phone' });
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(200).json({ ok: false, error: 'Supabase env missing' });
    return;
  }

  // Normalize phone to E.164 format
  if (!phone.startsWith('+')) {
    // If it starts with 1, add +
    if (phone.startsWith('1') && phone.length === 11) {
      phone = '+' + phone;
    } 
    // If it's 10 digits, assume US and add +1
    else if (phone.match(/^\d{10}$/)) {
      phone = '+1' + phone;
    }
  }

  const encPhone = encodeURIComponent(phone);

  try {
    // First, get the lead_id for this phone
    const leadPath = `leads?phone=eq.${encPhone}&select=id,name,phone&limit=1`;
    const leadRows = await fetchFromRest(leadPath);
    
    if (!Array.isArray(leadRows) || leadRows.length === 0) {
      res.status(200).json({ 
        ok: true, 
        contact: { phone, name: phone },
        messages: [],
        note: 'Lead not found for this phone number'
      });
      return;
    }

    const lead = leadRows[0] as LeadRow;
    const leadId = lead.id;

    if (!leadId) {
      res.status(200).json({ 
        ok: true, 
        contact: { phone, name: lead.name || phone },
        messages: [],
        note: 'Lead found but no ID'
      });
      return;
    }

    // Query inbound and outbound by lead_id
    // Order by created_at, id for deterministic ordering
    const inboundPath = `messages_in?lead_id=eq.${leadId}&select=id,body,created_at&order=created_at.asc,id.asc&limit=500`;
    const outboundPath = `messages_out?lead_id=eq.${leadId}&select=id,body,status,created_at&order=created_at.asc,id.asc&limit=500`;

    const [inboundRows, outboundRows] = await Promise.all([
      fetchFromRest(inboundPath),
      fetchFromRest(outboundPath),
    ]);

    const inboundMessages = Array.isArray(inboundRows)
      ? inboundRows.map((raw) => {
          const row = raw as MessageRow;
          return {
            id: row.id || '',
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
            id: row.id || '',
            at: row?.created_at ?? '',
            dir: 'out' as const,
            body: row?.body ?? '',
            status: row?.status ?? undefined,
          };
        })
      : [];

    // Merge and sort by timestamp, then by id for deterministic ordering
    const messages = [...inboundMessages, ...outboundMessages].sort((a, b) => {
      const aTime = a.at ? new Date(a.at).getTime() : 0;
      const bTime = b.at ? new Date(b.at).getTime() : 0;
      
      // If same timestamp, use id as tiebreaker
      if (aTime === bTime) {
        return a.id.localeCompare(b.id);
      }
      
      return aTime - bTime;
    });

    const contact = {
      phone,
      name: lead?.name ?? phone,
    };

    res.status(200).json({ ok: true, contact, messages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'failed to load conversation';
    console.error('Thread load error:', error);
    res.status(200).json({ ok: false, error: message || 'failed to load conversation' });
  }
}
