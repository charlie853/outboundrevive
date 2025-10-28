import type { NextApiRequest, NextApiResponse } from 'next';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/account_settings?account_id=eq.${ACCOUNT_ID}&select=autotexter_enabled,brand,phone_from&limit=1`, {
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}` }
  });
  const [row] = await r.json().catch(() => []);
  res.status(200).json({ ok: true, ...(row ?? { autotexter_enabled: false }) });
}
