import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  // Placeholder plans; Stripe integration to replace
  return res.status(200).json({
    ok: true,
    plans: [
      { id: 'lite', name: 'Lite', cap: 1000, price: 29900 },
      { id: 'standard', name: 'Standard', cap: 2000, price: 39900 },
      { id: 'pro', name: 'Pro', cap: 5000, price: 59900 },
    ],
  });
}


