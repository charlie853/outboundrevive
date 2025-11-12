'use client';

import { useState } from 'react';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
}

const PLANS = [
  {
    id: 'lite',
    name: 'Lite',
    price: 299,
    cap: 1000,
    description: 'For growing teams and agencies',
    features: [
      '1,000 SMS segments/month',
      'AI-powered follow-ups',
      'CRM integrations (HubSpot, Salesforce)',
      'Advanced analytics dashboard',
      'Priority email support',
    ],
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 399,
    cap: 2000,
    description: 'For established businesses',
    features: [
      '2,000 SMS segments/month',
      'Everything in Lite',
      'Custom AI prompts',
      'Multi-user access',
      'API access',
      'Priority phone support',
    ],
    recommended: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 599,
    cap: 5000,
    description: 'For high-volume operations',
    features: [
      '5,000 SMS segments/month',
      'Everything in Standard',
      'Dedicated account manager',
      'White-label options',
      'Custom integrations',
      '99.9% SLA guarantee',
    ],
  },
];

export default function PricingModal({ isOpen, onClose, accountId }: PricingModalProps) {
  const [loading, setLoading] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePlanSelect = async (planId: string) => {
    setLoading(planId);
    try {
      console.log('[PricingModal] Creating Stripe checkout for:', { plan_id: planId, account_id: accountId });
      
      const response = await fetch('/api/billing/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, account_id: accountId }),
      });

      const data = await response.json();
      console.log('[PricingModal] Checkout response:', data);
      
      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        console.error('[PricingModal] No checkout URL:', data);
        alert(`Error: ${data.error || 'Could not create checkout session'}`);
        setLoading(null);
      }
    } catch (error) {
      console.error('[PricingModal] Checkout error:', error);
      alert('An error occurred. Please try again or contact support.');
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-slate-900 px-8 py-12 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Upgrade Your Plan
          </h2>
          <p className="text-lg text-indigo-100 max-w-2xl mx-auto">
            Choose the plan that fits your needs. All plans include AI-powered follow-ups, smart scheduling, and compliance automation.
          </p>
        </div>

        {/* One-time Setup Fee Banner */}
        <div className="mx-8 -mt-6 mb-8 rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50 p-6 text-center shadow-lg">
          <h3 className="text-xl font-bold text-slate-900 mb-2">One-Time Setup Fee</h3>
          <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600 mb-2">
            $299
          </p>
          <p className="text-xs text-slate-500">
            Required for all new accounts • Includes full onboarding (~1 week)
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="px-8 pb-8">
          <div className="grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 ${
                  plan.recommended ? 'border-indigo-500 shadow-xl' : 'border-slate-200'
                } bg-white p-6 hover:shadow-lg transition-shadow`}
              >
                {plan.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-500 px-3 py-1 text-xs font-semibold text-white">
                    Recommended
                  </div>
                )}
                
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
                  <p className="mt-4">
                    <span className="text-4xl font-bold text-slate-900">${plan.price}</span>
                    <span className="text-sm font-semibold text-slate-600">/month</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{plan.cap.toLocaleString()} segments/month</p>
                </div>
                
                <button
                  onClick={() => handlePlanSelect(plan.id)}
                  disabled={loading === plan.id}
                  className={`w-full rounded-lg px-4 py-3 text-sm font-semibold text-white transition-colors shadow-sm ${
                    plan.recommended
                      ? 'bg-indigo-600 hover:bg-indigo-500'
                      : 'bg-slate-600 hover:bg-slate-500'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {loading === plan.id ? (
                    <span className="inline-flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </span>
                  ) : (
                    `Upgrade to ${plan.name}`
                  )}
                </button>
                
                <ul className="mt-6 space-y-2 text-sm text-slate-600">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex gap-x-2">
                      <svg className="h-5 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Enterprise CTA */}
          <div className="mt-8 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900">Need more than 5,000 segments?</h3>
            <p className="mt-2 text-slate-600">
              For high-volume needs, custom integrations, or white-label solutions, let's talk.
            </p>
            <a
              href="/contact?plan=enterprise"
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

