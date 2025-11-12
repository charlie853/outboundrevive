import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

const PLAN_CAPS: Record<string, number> = {
  starter: 500,
  lite: 1000,
  standard: 2000,
  pro: 5000,
};

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.STRIPE_SECRET_KEY || '';
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    if (!secret || !webhookSecret) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    const stripe = (await import('stripe')).default;
    const client = new stripe(secret, { apiVersion: '2024-06-20' });

    const sig = req.headers.get('stripe-signature') || '';
    const raw = await req.text();
    let event;
    try {
      event = client.webhooks.constructEvent(raw, sig, webhookSecret);
    } catch (err: any) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Handle checkout completion / subscription updates
    if (event.type === 'checkout.session.completed' || event.type === 'customer.subscription.updated') {
      const data: any = event.data?.object || {};
      const accountId = String(data?.client_reference_id || data?.metadata?.account_id || '').trim();
      const planId = String(data?.metadata?.plan_id || '').trim();
      if (accountId && planId && PLAN_CAPS[planId]) {
        await supabaseAdmin
          .from('tenant_billing')
          .upsert({
            account_id: accountId,
            plan_tier: planId,
            monthly_cap_segments: PLAN_CAPS[planId],
            updated_at: new Date().toISOString(),
          }, { onConflict: 'account_id' });
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}


