import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  
  // Real pricing plans aligned with Stripe products
  return res.status(200).json({
    ok: true,
    plans: [
      { 
        id: 'starter', 
        name: 'Starter', 
        cap: 500, 
        price: 0, 
        priceFormatted: 'Free',
        features: ['500 SMS segments/month', 'AI follow-ups', 'Smart quiet hours', 'Compliance automation', 'Basic analytics']
      },
      { 
        id: 'lite', 
        name: 'Lite', 
        cap: 1000, 
        price: 29900,
        priceFormatted: '$299/mo',
        features: ['1,000 segments/month', 'CRM integrations', 'Advanced analytics', 'Priority email support']
      },
      { 
        id: 'standard', 
        name: 'Standard', 
        cap: 2000, 
        price: 39900,
        priceFormatted: '$399/mo',
        features: ['2,000 segments/month', 'Custom AI prompts', 'Multi-user access', 'API access', 'Priority phone support'],
        recommended: true
      },
      { 
        id: 'pro', 
        name: 'Pro', 
        cap: 5000, 
        price: 59900,
        priceFormatted: '$599/mo',
        features: ['5,000 segments/month', 'Dedicated account manager', 'White-label', 'Custom integrations', '99.9% SLA']
      },
    ],
  });
}


