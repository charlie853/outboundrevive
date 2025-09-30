// app/api/internal/followups/run/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const db = createClient(
  process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ── auth
function isAdmin(req: Request) {
  const got = (req.headers.get('x-admin-token') || '').trim();
  const want =
    (process.env.ADMIN_API_KEY?.trim() || '') ||
    (process.env.ADMIN_TOKEN?.trim() || '');
  return !!want && got === want;
}

// ── util: parse "HH:MM"
function parseHM(s: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
  if (!m) return { h: 9, m: 0 };
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return { h, m: mm };
}

// local time helper using Intl (no extra deps)
function nowInTz(tz: string) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date()).map(p => [p.type, p.value]));
  const isoLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  // Interpret as local and convert to Date by appending Z isn’t correct—so also return the string pieces:
  return { isoLocal, y: +parts.year!, M: +parts.month!, d: +parts.day!, H: +parts.hour!, m: +parts.minute!, s: +parts.second! };
}

function isWithinWindow(tz: string, start: string, end: string) {
  const now = nowInTz(tz);
  const { h: sh, m: sm } = parseHM(start);
  const { h: eh, m: em } = parseHM(end);
  const nowMin = now.H * 60 + now.m;
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  // assume start < end on same day (e.g., 09:00–21:00)
  return nowMin >= startMin && nowMin <= endMin;
}

// build an ISO timestamp “X minutes ago” in UTC
function minutesAgoIso(mins: number) {
  const d = new Date(Date.now() - mins * 60 * 1000);
  return d.toISOString();
}

// get prefs or defaults
async function getPrefs(account_id: string) {
  const { data } = await db
    .from('account_followup_prefs')
    .select('*')
    .eq('account_id', account_id)
    .maybeSingle();
  return {
    freq_max_per_day: data?.freq_max_per_day ?? 2,
    freq_max_per_week: data?.freq_max_per_week ?? 10,
    quiet_start: data?.quiet_start ?? (process.env.QUIET_START || '09:00'),
    quiet_end:   data?.quiet_end   ?? (process.env.QUIET_END   || '21:00'),
    timezone:    data?.timezone    ?? (process.env.TIMEZONE    || 'America/New_York'),
    min_gap_minutes: data?.min_gap_minutes ?? 360,
  };
}

// count AI/auto followups in windows
async function getCounts(lead_id: string, sinceIso: string) {
  const { data, error } = await db
    .from('messages_out')
    .select('created_at,sent_by,operator_id')
    .eq('lead_id', lead_id)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return { total: 0, ai: 0, last_outbound_at: null as string | null };

  let ai = 0;
  let last: string | null = null;
  for (const r of data) {
    if (!last) last = r.created_at as any;
    // We consider our automation either sent_by='ai' OR operator_id='auto'
    if ((r.sent_by === 'ai') || (r.operator_id === 'auto')) ai++;
  }
  return { total: data.length, ai, last_outbound_at: last };
}

// last inbound time (optional—skip if table missing)
async function lastInboundAt(lead_id: string): Promise<string | null> {
  try {
    const { data, error } = await db
      .from('messages_in')
      .select('created_at')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return null;
    return data?.[0]?.created_at ?? null;
  } catch { return null; }
}

// Return a slice of candidate leads (phone present, not obviously opted out)
// NEW: try three shapes gracefully → opted_out (bool) → opted_out_at (ts) → fallback (no column)
async function getCandidateLeads(account_id: string, limit: number) {
  // 1) Try boolean opted_out
  const tryBool = await db
    .from('leads')
    .select('id,phone,opted_out,updated_at')
    .eq('account_id', account_id)
    .not('phone', 'is', null)
    .or('opted_out.eq.false,opted_out.is.null') // allow NULL = not opted-out
    .order('updated_at', { ascending: true })
    .limit(limit * 4);

  if (!tryBool.error) {
    const rows = (tryBool.data || []);
    return rows.slice(0, limit * 4);
  }

  // 2) Try timestamp opted_out_at
  const tryAt = await db
    .from('leads')
    .select('id,phone,opted_out_at,updated_at')
    .eq('account_id', account_id)
    .not('phone', 'is', null)
    .is('opted_out_at', null)
    .order('updated_at', { ascending: true })
    .limit(limit * 4);

  if (!tryAt.error) {
    const rows = (tryAt.data || []);
    return rows.slice(0, limit * 4);
  }

  // 3) Fallback: phone-only
  const simple = await db
    .from('leads')
    .select('id,phone,updated_at')
    .eq('account_id', account_id)
    .not('phone', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(limit * 4);

  return (simple.data || []).slice(0, limit * 4);
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const account_id: string = body.account_id || body.accountId;
    const limit: number = Math.max(1, Math.min(100, Number(body.limit ?? 25)));
    const dry_run: boolean = !!body.dry_run;
    const operator_id = body.operator_id || 'auto';
    const max_chars = Math.max(120, Math.min(300, Number(body.max_chars ?? 160)));
    const force: boolean = !!body.force;

    const prefs = await getPrefs(account_id);

    // Respect quiet window (global for the run). If outside, return early.
    const inWindow = isWithinWindow(prefs.timezone, prefs.quiet_start, prefs.quiet_end);
    const nowParts = nowInTz(prefs.timezone);
    const now_local = `${String(nowParts.H).padStart(2, '0')}:${String(nowParts.m).padStart(2, '0')}`;
    if (!inWindow && !force) {
      return NextResponse.json({
        ok: true,
        ran: false,
        reason: 'outside_quiet_window',
        window: { tz: prefs.timezone, start: prefs.quiet_start, end: prefs.quiet_end, now_local },
        caps: { per_day: prefs.freq_max_per_day, per_week: prefs.freq_max_per_week, min_gap_minutes: prefs.min_gap_minutes }
      });
    }

    const candidates = await getCandidateLeads(account_id, limit);
    const results: any[] = [];

    // time windows
    const since24h = minutesAgoIso(24 * 60);
    const since7d  = minutesAgoIso(7 * 24 * 60);

    for (const lead of candidates) {
      const lead_id = lead.id as string;

      // Daily / weekly caps for AI/auto
      const dayCounts   = await getCounts(lead_id, since24h);
      const weekCounts  = await getCounts(lead_id, since7d);

      // min gap
      const lastOut = dayCounts.last_outbound_at ? new Date(dayCounts.last_outbound_at).getTime() : 0;
      const gapOk = !lastOut || (Date.now() - lastOut) >= prefs.min_gap_minutes * 60 * 1000;

      const allowedToday = dayCounts.ai < prefs.freq_max_per_day;
      const allowedWeek  = weekCounts.ai < prefs.freq_max_per_week;

      if (!(allowedToday && allowedWeek && gapOk)) {
        results.push({
          lead_id,
          skipped: true,
          reason: !allowedToday ? 'day_cap' : !allowedWeek ? 'week_cap' : 'min_gap',
          day_ai: dayCounts.ai, week_ai: weekCounts.ai
        });
        continue;
      }

      // Optional: avoid pinging during an active back-and-forth — if user wrote in the last 2h skip.
      const lastIn = await lastInboundAt(lead_id);
      if (lastIn && (Date.now() - new Date(lastIn).getTime()) < 2 * 60 * 60 * 1000) {
        results.push({ lead_id, skipped: true, reason: 'recent_inbound_2h' });
        continue;
      }

      // Call suggest-followups → pick first
      const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
      const admin = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();

      const suggestRes = await fetch(`${base}/api/internal/knowledge/suggest-followups`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': admin },
        body: JSON.stringify({
          account_id, q: 'follow-up', previous: null, k: 3, n: 1, max_chars
        })
      }).then(r => r.json()).catch(() => null);

      const suggestion = suggestRes?.suggestions?.[0]?.text || 'Just checking in—would you like to book a quick spot?';

      // Dry run? Collect and continue.
      if (dry_run) {
        results.push({
          lead_id, drafted: suggestion, sent: false, dry_run: true,
          day_ai: dayCounts.ai, week_ai: weekCounts.ai
        });
        continue;
      }

      // Draft (and send) via your knowledge/draft endpoint so gates/compliance apply
      const draftRes = await fetch(`${base}/api/internal/knowledge/draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': admin },
        body: JSON.stringify({
          account_id,
          q: suggestion,
          k: 3,
          max_chars,
          send: true,
          lead_id,
          operator_id
        })
      }).then(r => r.json()).catch(e => ({ error: String(e) }));

      results.push({
        lead_id,
        drafted: draftRes?.draft?.text ?? suggestion,
        sent: !!draftRes?.sent,
        draft_meta: draftRes?.model ?? null,
        error: draftRes?.error || draftRes?.send_error || null
      });

      // Stop at hard limit of this run
      if (results.filter(r => r.sent || r.dry_run).length >= limit) break;
    }

    return NextResponse.json({
      ok: true,
      ran: true,
      account_id,
      window: { tz: prefs.timezone, start: prefs.quiet_start, end: prefs.quiet_end, now_local },
      caps: { per_day: prefs.freq_max_per_day, per_week: prefs.freq_max_per_week, min_gap_minutes: prefs.min_gap_minutes },
      processed: results.length,
      results
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'folclearlowups_run_crash', detail: e?.message || String(e) }, { status: 500 });
  }
}
