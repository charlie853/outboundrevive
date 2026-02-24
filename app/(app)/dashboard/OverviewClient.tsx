'use client';

import Link from 'next/link';
import KpiCards from '@/app/(app)/dashboard/components/KpiCards';
import RepliesChart from '@/app/(app)/dashboard/components/RepliesChart';
import { WhiteChartCard } from '@/app/components/StatCard';
import { TimeRangeSelector, useTimeRange } from '@/app/(app)/dashboard/components/TimeRangeSelector';
import { useMetricsData } from '@/app/(app)/dashboard/components/useMetricsData';
import TopBar from '@/app/(app)/dashboard/components/TopBar';
import AutotexterToggle from '@/app/components/AutotexterToggle';
import VerticalInsights from '@/app/(app)/dashboard/components/VerticalInsights';

export default function OverviewClient() {
  const { range, setRange } = useTimeRange();
  const { kpis, replyPoints, isLoading, error, showBanner, isUnauthorized, mutate } = useMetricsData(range);

  return (
    <div>
      <TopBar
        title="Overview"
        subtitle="Quick health snapshot of your outreach performance."
        rightContent={
          <div className="flex items-center gap-3">
            <TimeRangeSelector range={range} onRangeChange={setRange} />
            <AutotexterToggle />
          </div>
        }
      />

      {showBanner && (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Metrics temporarily unavailable. If you're not signed in, please sign in and refresh.
          <button
            type="button"
            className="ml-3 rounded-lg border border-amber-400 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
            onClick={() => mutate()}
          >
            Retry
          </button>
        </div>
      )}

      {error && !isUnauthorized && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Couldn't load metrics.
          <button
            type="button"
            className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
            onClick={() => mutate()}
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="mt-6">
        {isLoading && !kpis ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-28 animate-pulse rounded-[12px] bg-surface-bg" />
            ))}
          </div>
        ) : (
          <KpiCards data={kpis} />
        )}
      </div>

      {/* Chart - full width */}
      <div className="mt-8">
        {replyPoints.length >= 1 ? (
          <WhiteChartCard title="Lead Engagement">
            <RepliesChart days={replyPoints} />
          </WhiteChartCard>
        ) : (
          <WhiteChartCard title="Lead Engagement">
            <div className="text-sm text-ink-2">No replies yet. Once leads respond, you'll see engagement trends here.</div>
          </WhiteChartCard>
        )}
      </div>

      {/* Email dashboard quick access */}
      <div className="mt-8">
        <div className="rounded-xl border border-surface-border bg-surface-card shadow-sm overflow-hidden">
          <div className="border-b border-surface-border px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink-1">Email</h2>
              <p className="text-sm text-ink-2 mt-0.5">Cold email campaigns, Unibox, and deliverability.</p>
            </div>
            <Link
              href="/dashboard/email"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
            >
              Open Email →
            </Link>
          </div>
          <div className="px-6 py-4 flex flex-wrap gap-3">
            <Link href="/dashboard/email/campaigns" className="text-sm font-medium text-ink-2 hover:text-brand-600 transition">Campaigns</Link>
            <Link href="/dashboard/email/leads" className="text-sm font-medium text-ink-2 hover:text-brand-600 transition">Leads</Link>
            <Link href="/dashboard/email/unibox" className="text-sm font-medium text-ink-2 hover:text-brand-600 transition">Unibox</Link>
            <Link href="/dashboard/email/domains" className="text-sm font-medium text-ink-2 hover:text-brand-600 transition">Domains</Link>
            <Link href="/dashboard/email/stats" className="text-sm font-medium text-ink-2 hover:text-brand-600 transition">Stats</Link>
          </div>
        </div>
      </div>

      {/* Vertical Insights - Auto Dealer Features */}
      <div className="mt-8">
        <VerticalInsights />
      </div>
    </div>
  );
}

