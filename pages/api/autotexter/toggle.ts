import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL!;
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

    const { enabled } = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) ?? {};
    if (typeof enabled !== 'boolean') return res.status(400).json({ ok: false, error: 'bad_enabled' });

    // Persist toggle
    const up = await fetch(`${SUPABASE_URL}/rest/v1/account_settings?account_id=eq.${ACCOUNT_ID}`, {
      method: 'PATCH',
      headers: {
        'apikey': SRK, 'Authorization': `Bearer ${SRK}`,
        'Content-Type': 'application/json', Prefer: 'return=representation'
      },
      body: JSON.stringify({ autotexter_enabled: enabled })
    });

    const rows = await up.json().catch(() => []);
    const saved = Array.isArray(rows) && rows[0] ? !!rows[0].autotexter_enabled : enabled;

    // If turning ON, immediately kick off (seed any unsent intros)
    let kickoff: any = null;
    if (saved) {
      const r = await fetch(`${PUBLIC_BASE_URL}/api/autotexter/kickoff`, { method: 'POST' }).catch(() => null);
      kickoff = r ? await r.json().catch(() => null) : null;
    }

    res.status(200).json({ ok: true, enabled: saved, kickoff });
  } catch (e: any) {
    res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
