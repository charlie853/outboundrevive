import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing | OutboundRevive',
  description: 'Simple, transparent pricing for AI-powered SMS follow-ups. Start free, upgrade as you grow.',
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <section className="relative overflow-hidden bg-gradient-to-r from-indigo-600 via-indigo-700 to-slate-900 py-20">
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-10"></div>
        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Simple, Transparent Pricing
            </h1>
            <p className="mt-6 text-lg leading-8 text-indigo-100">
              Start free, then upgrade as you grow. All plans include AI-powered follow-ups, 
              smart scheduling, and compliance automation.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="relative py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3">
            
            {/* Free Plan */}
            <div className="relative rounded-2xl border-2 border-slate-200 bg-white p-8 shadow-sm hover:shadow-lg transition-shadow">
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-slate-900">Starter</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Perfect for testing and small teams
                </p>
                <p className="mt-6">
                  <span className="text-4xl font-bold tracking-tight text-slate-900">$0</span>
                  <span className="text-sm font-semibold leading-6 text-slate-600">/month</span>
                </p>
                <p className="mt-2 text-sm text-slate-500">500 segments/month</p>
              </div>
              
              <a
                href="/auth/login"
                className="block w-full rounded-lg border border-indigo-600 bg-white px-3 py-2 text-center text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
              >
                Get Started Free
              </a>
              
              <ul className="mt-8 space-y-3 text-sm leading-6 text-slate-600">
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span><strong>500 SMS segments</strong> per month</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>AI-powered follow-ups</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Smart quiet hours</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Compliance automation</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Basic analytics</span>
                </li>
              </ul>
            </div>

            {/* Lite Plan */}
            <div className="relative rounded-2xl border-2 border-slate-200 bg-white p-8 shadow-sm hover:shadow-lg transition-shadow">
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-slate-900">Lite</h3>
                <p className="mt-2 text-sm text-slate-600">
                  For growing teams and agencies
                </p>
                <p className="mt-6">
                  <span className="text-4xl font-bold tracking-tight text-slate-900">$299</span>
                  <span className="text-sm font-semibold leading-6 text-slate-600">/month</span>
                </p>
                <p className="mt-2 text-sm text-slate-500">1,000 segments/month</p>
              </div>
              
              <a
                href="/settings?plan=lite"
                className="block w-full rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm"
              >
                Upgrade to Lite
              </a>
              
              <ul className="mt-8 space-y-3 text-sm leading-6 text-slate-600">
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span><strong>1,000 SMS segments</strong> per month</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Everything in Starter</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>CRM integrations (HubSpot, Salesforce)</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Advanced analytics dashboard</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Priority email support</span>
                </li>
              </ul>
            </div>

            {/* Standard Plan - Most Popular */}
            <div className="relative rounded-2xl border-2 border-indigo-600 bg-white p-8 shadow-xl hover:shadow-2xl transition-shadow ring-2 ring-indigo-600">
              <div className="absolute -top-5 left-1/2 -translate-x-1/2">
                <span className="inline-flex rounded-full bg-indigo-600 px-4 py-1 text-sm font-semibold text-white">
                  Most Popular
                </span>
              </div>
              
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-slate-900">Standard</h3>
                <p className="mt-2 text-sm text-slate-600">
                  For established businesses
                </p>
                <p className="mt-6">
                  <span className="text-4xl font-bold tracking-tight text-slate-900">$399</span>
                  <span className="text-sm font-semibold leading-6 text-slate-600">/month</span>
                </p>
                <p className="mt-2 text-sm text-slate-500">2,000 segments/month</p>
              </div>
              
              <a
                href="/settings?plan=standard"
                className="block w-full rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm"
              >
                Upgrade to Standard
              </a>
              
              <ul className="mt-8 space-y-3 text-sm leading-6 text-slate-600">
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span><strong>2,000 SMS segments</strong> per month</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Everything in Lite</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Custom AI training & prompts</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Multi-user team access</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>API access</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Priority phone & chat support</span>
                </li>
              </ul>
            </div>

            {/* Pro Plan */}
            <div className="relative rounded-2xl border-2 border-slate-200 bg-white p-8 shadow-sm hover:shadow-lg transition-shadow lg:col-span-3 lg:mx-auto lg:max-w-md">
              <div className="mb-8">
                <h3 className="text-lg font-semibold text-slate-900">Pro</h3>
                <p className="mt-2 text-sm text-slate-600">
                  For high-volume operations
                </p>
                <p className="mt-6">
                  <span className="text-4xl font-bold tracking-tight text-slate-900">$599</span>
                  <span className="text-sm font-semibold leading-6 text-slate-600">/month</span>
                </p>
                <p className="mt-2 text-sm text-slate-500">5,000 segments/month</p>
              </div>
              
              <a
                href="/settings?plan=pro"
                className="block w-full rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm"
              >
                Upgrade to Pro
              </a>
              
              <ul className="mt-8 space-y-3 text-sm leading-6 text-slate-600">
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span><strong>5,000 SMS segments</strong> per month</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Everything in Standard</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Dedicated account manager</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>White-label options</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>Custom integrations</span>
                </li>
                <li className="flex gap-x-3">
                  <svg className="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                  </svg>
                  <span>99.9% SLA guarantee</span>
                </li>
              </ul>
            </div>
          </div>

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

