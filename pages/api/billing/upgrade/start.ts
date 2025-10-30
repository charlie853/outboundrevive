import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const { plan_id } = await req.json().catch(() => ({}));
  if (!plan_id) return res.status(400).json({ error: 'Missing plan_id' });
  // TODO: Integrate Stripe Checkout; for now return a placeholder URL
  const url = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '') + `/settings?upgrade=${encodeURIComponent(plan_id)}`;
  return res.status(200).json({ ok: true, url });
}


