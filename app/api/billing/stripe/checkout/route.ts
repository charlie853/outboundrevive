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
    if (!plan_id || !account_id) return NextResponse.json({ error: 'Missing plan_id or account_id' }, { status: 400 });

    const secret = process.env.STRIPE_SECRET_KEY || '';
    if (!secret) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    const plan = PLANS[String(plan_id)] || null;
    if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });

    const stripe = (await import('stripe')).default;
    const client = new stripe(secret, { apiVersion: '2024-06-20' });

    // In a real setup, map plan_id -> Stripe Price ID
    const price = process.env[`STRIPE_PRICE_${String(plan_id).toUpperCase()}`];
    if (!price) return NextResponse.json({ error: 'Missing Stripe price for plan' }, { status: 500 });

    const success = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '') + '/settings?upgrade=success';
    const cancel = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '') + '/settings?upgrade=cancel';

    const session = await client.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      success_url: success,
      cancel_url: cancel,
      client_reference_id: account_id,
      metadata: { account_id, plan_id },
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}


