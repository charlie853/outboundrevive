import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  
  // Real pricing plans aligned with Stripe products
  // Note: $299 one-time setup fee applies to all new accounts
  return res.status(200).json({
    ok: true,
    setupFee: 29900, // $299 one-time
    plans: [
      { 
        id: 'lite', 
        name: 'Lite', 
        cap: 1000, 
        price: 29900,
        priceFormatted: '$299/mo',
        features: ['1,000 SMS segments/month', 'AI-powered follow-ups', 'CRM integrations (HubSpot, Salesforce)', 'Advanced analytics', 'Priority email support']
      },
      { 
        id: 'standard', 
        name: 'Standard', 
        cap: 2000, 
        price: 39900,
        priceFormatted: '$399/mo',
        features: ['2,000 SMS segments/month', 'Everything in Lite', 'Custom AI prompts', 'Multi-user access', 'API access', 'Priority phone support'],
        recommended: true
      },
      { 
        id: 'pro', 
        name: 'Pro', 
        cap: 5000, 
        price: 59900,
        priceFormatted: '$599/mo',
        features: ['5,000 SMS segments/month', 'Everything in Standard', 'Dedicated account manager', 'White-label options', 'Custom integrations', '99.9% SLA']
      },
    ],
  });
}


