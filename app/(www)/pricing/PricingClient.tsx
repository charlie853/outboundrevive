'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Plan {
  id: string;
  name: string;
  price: number;
  cap: number;
  description: string;
  features: string[];
  recommended?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'lite',
    name: 'Lite',
    price: 299,
    cap: 1000,
    description: 'For growing teams and agencies',
    features: [
      '1,000 SMS segments per month',
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
      '2,000 SMS segments per month',
      'Everything in Lite',
      'Custom AI training & prompts',
      'Multi-user team access',
      'API access',
      'Priority phone & chat support',
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
      '5,000 SMS segments per month',
      'Everything in Standard',
      'Dedicated account manager',
      'White-label options',
      'Custom integrations',
      '99.9% SLA guarantee',
    ],
  },
];

export default function PricingClient({ isLoggedIn, accountId }: { isLoggedIn?: boolean; accountId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const handlePlanSelect = async (planId: string) => {
    if (!isLoggedIn || !accountId) {
      // Not logged in - redirect to contact
      router.push(`/contact?plan=${planId}`);
      return;
    }

    // Logged in - trigger Stripe checkout
    setLoading(planId);
    try {
      const response = await fetch('/api/billing/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, account_id: accountId }),
      });

      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to create checkout session');
        setLoading(null);
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Failed to start checkout. Please try again.');
      setLoading(null);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={`relative rounded-2xl border-2 bg-white p-8 shadow-sm hover:shadow-lg transition-shadow ${
            plan.recommended
              ? 'border-indigo-600 ring-2 ring-indigo-600'
              : 'border-slate-200'
          }`}
        >
          {plan.recommended && (
            <div className="absolute -top-5 left-1/2 -translate-x-1/2">
              <span className="inline-flex rounded-full bg-indigo-600 px-4 py-1 text-sm font-semibold text-white">
                Most Popular
              </span>
            </div>
          )}

          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
            <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
            <p className="mt-6">
              <span className="text-4xl font-bold tracking-tight text-slate-900">
                ${plan.price}
              </span>
              <span className="text-sm font-semibold leading-6 text-slate-600">/month</span>
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {plan.cap.toLocaleString()} segments/month
            </p>
          </div>

          <button
            onClick={() => handlePlanSelect(plan.id)}
            disabled={loading === plan.id}
            className={`block w-full rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors shadow-sm ${
              plan.recommended
                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                : 'border border-indigo-600 bg-white text-indigo-600 hover:bg-indigo-50'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {loading === plan.id ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading...
              </span>
            ) : isLoggedIn ? (
              `Upgrade to ${plan.name}`
            ) : (
              `Get Started with ${plan.name}`
            )}
          </button>

          <ul className="mt-8 space-y-3 text-sm leading-6 text-slate-600">
            {plan.features.map((feature, idx) => (
              <li key={idx} className="flex gap-x-3">
                <svg
                  className="h-6 w-5 flex-none text-indigo-600"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

