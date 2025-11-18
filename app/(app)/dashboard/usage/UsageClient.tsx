'use client';

import { useState } from 'react';
import { ChartCard } from '@/app/components/StatCard';
import PricingModal from '@/app/components/PricingModal';
import { useMetricsData } from '@/app/(app)/dashboard/components/useMetricsData';
import { useTimeRange } from '@/app/(app)/dashboard/components/TimeRangeSelector';
import TopBar from '@/app/(app)/dashboard/components/TopBar';

export default function UsageClient() {
  const { range } = useTimeRange();
  const { billing } = useMetricsData(range);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);

  const used = Number(billing?.segments_used || 0);
  const cap = Number(billing?.monthly_cap_segments || 0);
  const pct = cap > 0 ? Math.min(1, used / cap) : 0;
  const pc100 = Math.round(pct * 100);

  return (
    <div>
      <TopBar
        title="Usage & Billing"
        subtitle="SMS usage, plan limits, and billing information."
      />

      {/* Monthly SMS Cap - 2 column layout on xl */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-ink-1">Monthly SMS Cap</h3>
              <button
                onClick={() => setIsPricingModalOpen(true)}
                className="text-sm font-bold text-warning hover:opacity-80 underline transition-colors"
              >
                View Plans →
              </button>
            </div>
            {billing?.monthly_cap_segments ? (
              <div>
                <div className="text-xs text-ink-2 mb-1">Plan: {billing?.plan_tier || 'unknown'}</div>
                <div className="space-y-2">
                  <div className="w-full h-2 bg-surface-line rounded">
                    <div className={`h-2 rounded ${pc100 >= 100 ? 'bg-danger' : pc100 >= 80 ? 'bg-warning' : 'bg-brand-500'}`} style={{ width: `${pc100}%` }} />
                  </div>
                  <div className="text-xs text-ink-2">{used} / {cap} segments ({pc100}%)</div>
                  {pc100 >= 100 && (
                    <div className="text-xs text-danger">Cap reached — outbound paused. <button onClick={() => setIsPricingModalOpen(true)} className="underline">Upgrade</button></div>
                  )}
                  {pc100 >= 80 && pc100 < 100 && (
                    <div className="text-xs text-warning">Approaching cap — consider upgrading. <button onClick={() => setIsPricingModalOpen(true)} className="underline">Upgrade</button></div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-ink-2">Billing info unavailable.</div>
            )}
          </ChartCard>
        </div>
        <div className="xl:col-span-1">
          <div className="h-full p-6 rounded-[12px] bg-white border border-surface-line shadow-sm">
            <h3 className="text-sm font-bold text-ink-1 mb-3">About Usage</h3>
            <div className="space-y-2 text-sm text-ink-2 leading-relaxed">
              <p>SMS usage is measured in segments. Each SMS message counts as 1-3 segments depending on length.</p>
              <p>Your monthly cap resets at the start of each billing cycle. Upgrade your plan to increase limits.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Metrics Cards */}
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <ChartCard>
          <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">Messages Sent This Month</div>
          <div className="text-2xl font-bold text-ink-1">—</div>
          <p className="text-xs text-ink-2 mt-2">Total messages sent in current billing cycle.</p>
        </ChartCard>
        <ChartCard>
          <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">Projected Usage</div>
          <div className="text-2xl font-bold text-ink-1">—</div>
          <p className="text-xs text-ink-2 mt-2">Estimated usage by end of billing cycle.</p>
        </ChartCard>
        <ChartCard>
          <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">Overage Risk</div>
          <div className="text-2xl font-bold text-ink-1">{pc100 >= 80 ? 'High' : pc100 >= 60 ? 'Medium' : 'Low'}</div>
          <p className="text-xs text-ink-2 mt-2">Likelihood of exceeding your monthly cap.</p>
        </ChartCard>
      </div>

      {/* Pricing Modal */}
      <PricingModal
        isOpen={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
        accountId={billing?.account_id || process.env.NEXT_PUBLIC_DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111'}
      />
    </div>
  );
}

