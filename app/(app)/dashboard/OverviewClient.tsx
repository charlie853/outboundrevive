'use client';

import KpiCards from '@/app/(app)/dashboard/components/KpiCards';
import RepliesChart from '@/app/(app)/dashboard/components/RepliesChart';
import { WhiteChartCard } from '@/app/components/StatCard';
import { TimeRangeSelector, useTimeRange } from '@/app/(app)/dashboard/components/TimeRangeSelector';
import { useMetricsData } from '@/app/(app)/dashboard/components/useMetricsData';
import TopBar from '@/app/(app)/dashboard/components/TopBar';
import AutotexterToggle from '@/app/components/AutotexterToggle';

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
    </div>
  );
}

