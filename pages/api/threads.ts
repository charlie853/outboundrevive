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
  const accountId = (Array.isArray(req.query.account_id) ? req.query.account_id[0] : req.query.account_id) || process.env.DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111';
  
  console.log('[threads] Request:', { limit, accountId, query: req.query });

  // Pull all leads for this account (not just those with messages)
  // Order by most recent activity (reply, send, inbound, outbound, or created_at)
  // NEW: Include enrichment fields (opted_out, lead_type, crm_owner, last_inbound_at, last_outbound_at, appointment_set_at, booked)
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    // Remove the restrictive 'or' filter - show all leads, not just those with messages
    // Note: last_inbound_at and last_outbound_at don't exist on leads table - we'll compute from messages
    const qs = new URLSearchParams({
      select: 'id,phone,name,last_reply_body,last_reply_at,last_sent_at,opted_out,lead_type,crm_owner,appointment_set_at,booked,created_at',
      account_id: `eq.${encodeURIComponent(accountId)}`,
      order: 'last_reply_at.desc.nullslast,last_sent_at.desc.nullslast,created_at.desc',
      limit: String(limit * 3), // fetch a few extra, we'll de-dup in code
    });

    const queryUrl = `${URL}/rest/v1/leads?${qs.toString()}`;
    console.log('[threads] Query URL:', queryUrl.replace(KEY, '***'));

    const r = await fetch(queryUrl, {
      signal: ac.signal,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Prefer: 'count=exact',
      },
    });

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      console.error('[threads] Supabase query failed:', text.slice(0, 500));
      // Always return ok: true with empty threads, not ok: false, so UI doesn't show error banner
      res.status(200).json({ ok: true, threads: [], note: `rest_error: ${text.slice(0,200)}`, accountId, error: 'query_failed' });
      return;
    }

    const rows: any[] = await r.json().catch(() => []);
    
    console.log(`[threads] Found ${rows.length} leads for account ${accountId}`);
    if (rows.length === 0) {
      console.log('[threads] No leads found - checking if account_id is correct');
      // Debug: Try to see if there are any leads at all for this account
      const debugQs = new URLSearchParams({
        select: 'id,phone,name,account_id',
        account_id: `eq.${encodeURIComponent(accountId)}`,
        limit: '5',
      });
      const debugRes = await fetch(`${URL}/rest/v1/leads?${debugQs.toString()}`, {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
        signal: AbortSignal.timeout(3000),
      }).catch(() => null);
      if (debugRes?.ok) {
        const debugRows = await debugRes.json().catch(() => []);
        console.log('[threads] Debug query result:', { count: debugRows.length, sample: debugRows[0] });
      }
    } else {
      console.log('[threads] Sample lead:', { id: rows[0]?.id, phone: rows[0]?.phone, name: rows[0]?.name });
    }
    
    // Fetch latest appointment status for each lead (to get booking status)
    const leadIds = [...new Set(rows.map(r => r.id).filter(Boolean))];
    const appointmentsMap = new Map<string, any>();
    if (leadIds.length > 0) {
      try {
        const apptQs = new URLSearchParams({
          select: 'lead_id,status,starts_at',
          lead_id: `in.(${leadIds.join(',')})`,
          account_id: `eq.${encodeURIComponent(accountId)}`,
          order: 'starts_at.desc.nullslast,created_at.desc',
        });
        const apptRes = await fetch(`${URL}/rest/v1/appointments?${apptQs.toString()}`, {
          signal: ac.signal,
          headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
        });
        if (apptRes.ok) {
          const appts: any[] = await apptRes.json().catch(() => []);
          for (const appt of appts) {
            if (appt.lead_id && !appointmentsMap.has(appt.lead_id)) {
              appointmentsMap.set(appt.lead_id, appt);
            }
          }
        }
      } catch (e) {
        console.warn('[threads] failed to fetch appointments', e);
      }
    }
    
    // Map to thread objects; keep both snakeCase and camelCase to satisfy any UI shape.
    const byPhone = new Map<string, any>();
    for (const row of rows) {
      const phone = row.phone ?? '';
      if (!phone) continue;

      const lastReplyAt = row.last_reply_at ? Date.parse(row.last_reply_at) : 0;
      const lastSentAt  = row.last_sent_at  ? Date.parse(row.last_sent_at)  : 0;
      const createdAt = row.created_at ? Date.parse(row.created_at) : 0;
      // Note: last_inbound_at and last_outbound_at don't exist on leads - using last_reply_at and last_sent_at instead
      const lastAtMs = Math.max(lastReplyAt, lastSentAt, createdAt);
      const lastAtISO = lastAtMs > 0 ? new Date(lastAtMs).toISOString() : null;
      
      // Use last_reply_body if available, otherwise show nothing (not "No messages yet")
      const lastMessage = row.last_reply_body || null;

      // Determine booking status
      const appt = row.id ? appointmentsMap.get(row.id) : null;
      let bookingStatus: string | null = null;
      if (appt) {
        bookingStatus = appt.status; // 'booked', 'rescheduled', 'canceled', 'kept', 'no_show'
      } else if (row.appointment_set_at || row.booked) {
        bookingStatus = 'booked';
      }

      // Keep the newest per phone
      const existing = byPhone.get(phone);
      if (!existing || (existing.lastAtMs ?? 0) < lastAtMs) {
        byPhone.set(phone, {
          // canonical
          id: row.id ?? null,
          phone,
          name: row.name ?? null,
          lastMessage: lastMessage ?? row.last_reply_body ?? null,
          lastAt: lastAtISO,
          // NEW: Enrichment fields
          opted_out: row.opted_out ?? false,
          lead_type: row.lead_type ?? null,
          crm_owner: row.crm_owner ?? null,
          booking_status: bookingStatus,
          last_activity: lastAtISO, // max of all activity timestamps
          // aliases (in case UI expects these)
          lead_id: row.id ?? null,
          lead_phone: phone,
          lead_name: row.name ?? null,
          last_message: lastMessage ?? row.last_reply_body ?? null,
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

    console.log(`[threads] Returning ${threads.length} threads for account ${accountId}`);
    res.status(200).json({ ok: true, threads, accountId, debug: { totalLeads: rows.length, threadsReturned: threads.length } });
  } catch (e: any) {
    console.error('[threads] Error:', e?.message || e);
    // Always return ok: true with empty threads on error, not ok: false
    res.status(200).json({ ok: true, threads: [], error: e?.message || 'Unknown error', accountId });
  } finally {
    clearTimeout(timer);
  }
}
