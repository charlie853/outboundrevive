'use client';

import Funnel from '@/app/(app)/dashboard/components/Funnel';
import { TimeRangeSelector, useTimeRange } from '@/app/(app)/dashboard/components/TimeRangeSelector';
import { useMetricsData } from '@/app/(app)/dashboard/components/useMetricsData';
import TopBar from '@/app/(app)/dashboard/components/TopBar';

export default function FunnelClient() {
  const { range, setRange } = useTimeRange();
  const { funnelData, isLoading, error, showBanner, isUnauthorized, mutate } = useMetricsData(range);

  return (
    <div>
      <TopBar
        title="Funnel & Metrics"
        subtitle="Conversion stages and lead progression analytics."
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

      {/* Funnel Visualization */}
      <div className="mt-6">
        <Funnel data={funnelData} />
      </div>
    </div>
  );
}

