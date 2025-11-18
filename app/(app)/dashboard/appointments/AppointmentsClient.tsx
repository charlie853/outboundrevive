'use client';

import { ChartCard } from '@/app/components/StatCard';
import { TimeRangeSelector, useTimeRange } from '@/app/(app)/dashboard/components/TimeRangeSelector';
import { useMetricsData } from '@/app/(app)/dashboard/components/useMetricsData';
import TopBar from '@/app/(app)/dashboard/components/TopBar';

export default function AppointmentsClient() {
  const { range, setRange } = useTimeRange();
  const { kpis, isLoading, error, showBanner, isUnauthorized, mutate } = useMetricsData(range);

  const showUpRate = (kpis.appointmentsBooked ?? 0) > 0 
    ? Math.round(((kpis.appointmentsKept ?? 0) / (kpis.appointmentsBooked ?? 1)) * 100)
    : 0;

  return (
    <div>
      <TopBar
        title="Appointments"
        subtitle="Track appointment performance and show-up rates."
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

      {/* Appointment Performance - 2 column layout on xl */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard title="Appointment Performance">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-4 rounded-[12px] bg-surface-bg border border-surface-line">
                <div className="flex-1">
                  <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">Booked</div>
                  <div className="text-3xl font-bold text-ink-1">{kpis.appointmentsBooked ?? 0}</div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-[12px] bg-surface-bg border border-surface-line">
                <div className="flex-1">
                  <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">No-Show</div>
                  <div className="text-3xl font-bold text-ink-1">{kpis.appointmentsNoShow ?? 0}</div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-[12px] bg-surface-bg border border-surface-line">
                <div className="flex-1">
                  <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">Kept (Attended)</div>
                  <div className="text-3xl font-bold text-ink-1">{kpis.appointmentsKept ?? 0}</div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-[12px] bg-surface-bg border border-surface-line">
                <div className="flex-1">
                  <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">Show-up Rate</div>
                  <div className="text-3xl font-bold text-ink-1">{showUpRate}%</div>
                </div>
              </div>
            </div>
            <p className="text-xs text-ink-2 mt-4">
              Tracked from calendar webhooks. Booked includes rescheduled appointments.
            </p>
          </ChartCard>
        </div>
        <div className="xl:col-span-1">
          <div className="h-full p-6 rounded-[12px] bg-white border border-surface-line shadow-sm">
            <h3 className="text-sm font-bold text-ink-1 mb-3">About Appointments</h3>
            <div className="space-y-2 text-sm text-ink-2 leading-relaxed">
              <p>Appointments are automatically tracked when leads book through your calendar links (Calendly, Cal.com, etc.).</p>
              <p>Show-up rate helps you understand conversion quality and identify scheduling issues.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Show-Up Rate Trend Placeholder */}
      <div className="mt-8">
        <ChartCard title="Show-Up Rate Over Time">
          <div className="h-48 flex items-center justify-center text-sm text-ink-2">
            <div className="text-center">
              <div className="mb-2">📊</div>
              <p>Show-up rate trend chart coming soon.</p>
              <p className="text-xs mt-1">Track how your appointment attendance changes over time.</p>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

