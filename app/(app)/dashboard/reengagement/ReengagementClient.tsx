'use client';

import { ChartCard } from '@/app/components/StatCard';
import { TimeRangeSelector, useTimeRange } from '@/app/(app)/dashboard/components/TimeRangeSelector';
import { useMetricsData } from '@/app/(app)/dashboard/components/useMetricsData';
import TopBar from '@/app/(app)/dashboard/components/TopBar';

export default function ReengagementClient() {
  const { range, setRange } = useTimeRange();
  const { kpis, isLoading, error, showBanner, isUnauthorized, mutate } = useMetricsData(range);

  return (
    <div>
      <TopBar
        title="Re-engagement"
        subtitle="Revive old leads and track dormant contact reactivation."
        rightContent={<TimeRangeSelector range={range} onRangeChange={setRange} />}
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

      {/* Re-engagement - 2 column layout on xl */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard title="Lead Re-engagement">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-[12px] bg-surface-bg border border-surface-line">
                <div className="flex-1">
                  <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">Re-engaged Leads</div>
                  <div className="text-3xl font-bold text-ink-1">{kpis.reEngaged ?? 0}</div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-[12px] bg-surface-bg border border-surface-line">
                <div className="flex-1">
                  <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">Re-engagement Rate</div>
                  <div className="text-3xl font-bold text-ink-1">{kpis.reEngagementRate ?? 0}%</div>
                </div>
              </div>
            </div>
            <p className="text-xs text-ink-2 mt-4">
              Leads inactive 30+ days who replied or booked in this period.
            </p>
          </ChartCard>
        </div>
        <div className="xl:col-span-1">
          <div className="h-full p-6 rounded-[12px] bg-white border border-surface-line shadow-sm">
            <h3 className="text-sm font-bold text-ink-1 mb-3">About Re-engagement</h3>
            <div className="space-y-2 text-sm text-ink-2 leading-relaxed">
              <p>Re-engagement tracks leads who were inactive for 30+ days but have recently responded or booked appointments.</p>
              <p>This metric helps identify dormant contacts that are worth re-engaging with targeted campaigns.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Additional sections to fill space */}
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <ChartCard title="Re-engagement Trend">
          <div className="h-48 flex items-center justify-center text-sm text-ink-2">
            <div className="text-center">
              <div className="mb-2">📈</div>
              <p>Re-engagement trend chart coming soon.</p>
              <p className="text-xs mt-1">Track dormant leads reactivated over time.</p>
            </div>
          </div>
        </ChartCard>
        <ChartCard title="Top Re-engagement Segments">
          <div className="h-48 flex items-center justify-center text-sm text-ink-2">
            <div className="text-center">
              <div className="mb-2">🎯</div>
              <p>Segment analysis coming soon.</p>
              <p className="text-xs mt-1">Identify which lead types are most likely to re-engage.</p>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

