export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE = process.env.SUPABASE_URL!;

type MsgIn = { from_phone: string | null; body: string | null; created_at: string };

type Thread = {
  lead_phone: string;
  lead_name: string | null;
  last_message: string;
  last_at: string;
};

export async function GET(req: Request) {
  if (!SRK || !BASE) return Response.json({ ok: false, error: 'Missing SUPABASE env' }, { status: 500 });

  const u = new URL(req.url);
  const limit = Math.max(1, Math.min(50, Number(u.searchParams.get('limit') || 20)));

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 5000);

  try {
    // 1) latest inbound messages (enough to dedupe phones)
    const msgsRes = await fetch(
      `${BASE}/rest/v1/messages_in?select=from_phone,body,created_at&order=created_at.desc&limit=200`,
      {
        headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
        cache: 'no-store',
        signal: ctrl.signal
      }
    );

    const msgs: MsgIn[] = (await msgsRes.json()) || [];
    const perPhone = new Map<string, MsgIn>();
    for (const m of msgs) {
      if (!m.from_phone) continue;
      if (!perPhone.has(m.from_phone)) perPhone.set(m.from_phone, m); // first is latest
    }

    const phones = Array.from(perPhone.keys()).slice(0, limit);
    // 2) lookup lead names in one query (phone IN (...))
    let nameByPhone = new Map<string, string>();
    if (phones.length) {
      const quoted = phones.map(p => `"${p.replace(/"/g, '""')}"`).join(',');
      const url = `${BASE}/rest/v1/leads?select=phone,name&phone=in.(${encodeURIComponent(quoted)})`;
      const leadsRes = await fetch(url, {
        headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
        cache: 'no-store',
        signal: ctrl.signal
      });
      const leads: { phone: string; name: string | null }[] = await leadsRes.json();
      nameByPhone = new Map(leads.map(l => [l.phone, l.name || '']));
    }

    const threads = phones.map(p => {
      const m = perPhone.get(p)!;
      return {
        lead_phone: p,
        lead_name: nameByPhone.get(p) || null,
        last_message: m.body || '',
        last_at: m.created_at
      } as Thread;
    });

    return Response.json({ ok: true, threads });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
