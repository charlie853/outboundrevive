'use client';

import { useState } from 'react';
import DeliveryChart from '@/app/(app)/dashboard/components/DeliveryChart';
import RepliesChart from '@/app/(app)/dashboard/components/RepliesChart';
import { WhiteChartCard } from '@/app/components/StatCard';
import { TimeRangeSelector, useTimeRange } from '@/app/(app)/dashboard/components/TimeRangeSelector';
import { useMetricsData } from '@/app/(app)/dashboard/components/useMetricsData';
import TopBar from '@/app/(app)/dashboard/components/TopBar';
import ThreadsPanel from '@/app/components/ThreadsPanel';

export default function MessagingClient() {
  const { range, setRange } = useTimeRange();
  const { deliveryPoints, replyPoints, intents, isLoading, error, showBanner, isUnauthorized, mutate } = useMetricsData(range);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCrmRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleCrmConnect = () => {
    setTimeout(() => {
      setRefreshKey(prev => prev + 1);
    }, 3000);
  };

  return (
    <div>
      <TopBar
        title="Messaging"
        subtitle="SMS delivery, engagement, and message-level analytics."
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

      {/* Time Series Charts */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {deliveryPoints.length >= 1 ? (
          <WhiteChartCard title="Message Delivery">
            <DeliveryChart days={deliveryPoints} />
          </WhiteChartCard>
        ) : (
          <WhiteChartCard title="Message Delivery">
            <div className="text-sm text-ink-2">No delivery data yet. Send your first campaign to see stats here.</div>
          </WhiteChartCard>
        )}
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

      {/* Recent Threads */}
      <div className="mt-8">
        <ThreadsPanel key={refreshKey} />
      </div>
    </div>
  );
}

