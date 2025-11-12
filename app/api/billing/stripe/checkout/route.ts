import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PLANS: Record<string, { priceId?: string; cap: number }> = {
  lite: { cap: 1000 },
  standard: { cap: 2000 },
  pro: { cap: 5000 },
};

export async function POST(req: NextRequest) {
  try {
    const { plan_id, account_id } = await req.json().catch(() => ({}));
    console.log('[stripe/checkout] Request:', { plan_id, account_id });
    
    if (!plan_id || !account_id) {
      console.log('[stripe/checkout] Missing parameters');
      return NextResponse.json({ error: 'Missing plan_id or account_id' }, { status: 400 });
    }

    const secret = process.env.STRIPE_SECRET_KEY || '';
    if (!secret) {
      console.log('[stripe/checkout] Stripe secret key not configured');
      return NextResponse.json({ error: 'Stripe not configured - missing STRIPE_SECRET_KEY' }, { status: 500 });
    }
    
    const plan = PLANS[String(plan_id)] || null;
    if (!plan) {
      console.log('[stripe/checkout] Invalid plan:', plan_id);
      return NextResponse.json({ error: `Invalid plan: ${plan_id}` }, { status: 400 });
    }

    // Check for Stripe Price ID (price_xxx format, not prod_xxx)
    const envVarName = `STRIPE_PRICE_${String(plan_id).toUpperCase()}`;
    const price = process.env[envVarName];
    
    console.log('[stripe/checkout] Looking for env var:', envVarName, 'Found:', price ? 'yes' : 'no');
    
    if (!price) {
      console.log('[stripe/checkout] Available env vars:', Object.keys(process.env).filter(k => k.startsWith('STRIPE')));
      return NextResponse.json({ 
        error: `Missing Stripe price for ${plan_id}. Please set ${envVarName} to a Stripe Price ID (price_xxx, not prod_xxx)`,
        detail: 'Check Stripe Dashboard → Products → [Your Product] → Pricing → Copy Price ID'
      }, { status: 500 });
    }

    const stripe = (await import('stripe')).default;
    const client = new stripe(secret, { apiVersion: '2024-06-20' });

    const success = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '') + '/dashboard?upgrade=success';
    const cancel = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '') + '/dashboard?upgrade=cancel';

    console.log('[stripe/checkout] Creating session with price:', price);

    const session = await client.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      success_url: success,
      cancel_url: cancel,
      client_reference_id: account_id,
      metadata: { account_id, plan_id },
    });

    console.log('[stripe/checkout] Session created:', session.id);
    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: any) {
    console.error('[stripe/checkout] Error:', e.message, e.stack);
    return NextResponse.json({ error: e?.message || 'server_error', details: e?.stack }, { status: 500 });
  }
}


