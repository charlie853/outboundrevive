import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import PricingClient from './PricingClient';

export const metadata: Metadata = {
  title: 'Pricing | OutboundRevive',
  description: 'Simple, transparent pricing for AI-powered SMS follow-ups. Start free, upgrade as you grow.',
};

export default async function PricingPage() {
  // Check if user is logged in
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  
  // Get account_id if logged in
  let accountId: string | undefined;
  if (user) {
    const { data: userData } = await supabase
      .from('user_data')
      .select('account_id')
      .eq('user_id', user.id)
      .single();
    accountId = userData?.account_id;
  }
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <section className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-indigo-700 to-slate-900 py-20">
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-10"></div>
        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Flat & Simple Pricing
            </h1>
            <p className="mt-6 text-lg leading-8 text-indigo-100">
              $299 one-time setup, then choose your monthly plan. 
              All plans include AI-powered follow-ups, smart scheduling, and compliance automation.
            </p>
            <div className="mt-6 inline-flex items-center gap-3 rounded-full bg-amber-500 px-6 py-3 text-sm font-semibold text-indigo-900">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              ~1 week onboarding time included
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="relative py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          {/* One-time Setup Fee Banner */}
          <div className="mb-12 mx-auto max-w-3xl rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50 p-8 text-center shadow-lg">
            <h3 className="text-2xl font-bold text-slate-900 mb-2">One-Time Setup Fee</h3>
            <p className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600 mb-3">
              $299
            </p>
            <p className="text-sm text-slate-600 mb-4">
              Includes full onboarding, CRM integration, AI customization, and team training (~1 week)
            </p>
            <p className="text-xs text-slate-500">
              Required for all new accounts • One-time payment • No recurring setup fees
            </p>
          </div>

          <PricingClient isLoggedIn={!!user} accountId={accountId} />

          {/* Enterprise CTA */}
          <div className="mt-16 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-10 text-center">
            <h3 className="text-2xl font-bold text-slate-900">Need more than 5,000 segments?</h3>
            <p className="mt-4 text-lg text-slate-600">
              Get custom pricing and dedicated support for enterprise teams.
            </p>
            <a
              href="/contact"
              className="mt-6 inline-flex rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-slate-200 bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 text-center mb-12">
              Frequently Asked Questions
            </h2>
            <dl className="space-y-8">
              <div>
                <dt className="text-lg font-semibold text-slate-900">What's an SMS segment?</dt>
                <dd className="mt-2 text-base text-slate-600">
                  An SMS segment is 160 characters. Messages over 160 characters are split into multiple segments. 
                  For example, a 300-character message = 2 segments.
                </dd>
              </div>
              <div>
                <dt className="text-lg font-semibold text-slate-900">What happens if I hit my monthly cap?</dt>
                <dd className="mt-2 text-base text-slate-600">
                  Outbound messages will pause automatically. You'll see a notification in your dashboard with an option 
                  to upgrade your plan. Inbound replies always work regardless of cap.
                </dd>
              </div>
              <div>
                <dt className="text-lg font-semibold text-slate-900">Can I change plans anytime?</dt>
                <dd className="mt-2 text-base text-slate-600">
                  Yes! Upgrade or downgrade anytime from your settings page. Changes take effect immediately, 
                  and we'll prorate your billing.
                </dd>
              </div>
              <div>
                <dt className="text-lg font-semibold text-slate-900">Do unused segments roll over?</dt>
                <dd className="mt-2 text-base text-slate-600">
                  No, segments reset monthly on your billing anniversary. We recommend choosing a plan that matches 
                  your typical monthly volume.
                </dd>
              </div>
              <div>
                <dt className="text-lg font-semibold text-slate-900">Is there a contract or commitment?</dt>
                <dd className="mt-2 text-base text-slate-600">
                  No contracts required. All plans are month-to-month. Cancel anytime with no penalties or fees.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}

