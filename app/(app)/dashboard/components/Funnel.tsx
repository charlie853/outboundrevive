"use client";
import React from 'react';
import { ChartCard } from '@/app/components/StatCard';
import type { FunnelData } from '@/lib/types/metrics';

type Props = {
  data?: FunnelData;
};

const stageGradient = (index: number) => {
  if (index === 0) return 'from-indigo-500 to-indigo-600';
  if (index === 1) return 'from-indigo-400 to-indigo-500';
  if (index === 2) return 'from-indigo-300 to-indigo-400';
  if (index === 3) return 'from-amber-400 to-amber-500';
  return 'from-amber-500 to-orange-500';
};

export default function Funnel({ data }: Props) {
  const stages = Array.isArray(data?.stages) ? data!.stages : [];
  const rates = data?.rates ?? { contactRate: 0, replyRate: 0, bookingRate: 0 };
  const definitions = data?.definitions ?? {};
  const timezone = data?.meta?.timezone ?? 'America/New_York';
  const rangeLabel = data?.meta?.range?.toUpperCase?.() ?? '7D';

  if (!stages.length) {
    return (
      <ChartCard title="Conversion Funnel" className="md:col-span-2">
        <div className="text-sm text-ink-2">No funnel data available for this range.</div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Conversion Funnel" className="md:col-span-2">
      <div className="flex items-start justify-between text-xs text-ink-2 mb-6">
        <span>
          Lead progression for the selected window ({rangeLabel}) •{' '}
          <span className="text-ink-2/60">Bucketed with timezone {timezone}</span>
        </span>
        <details className="text-xs text-warning">
          <summary className="cursor-pointer hover:opacity-80 underline decoration-dotted">
            Definitions
          </summary>
          <div className="mt-2 space-y-1 text-ink-2">
            {stages.map((stage) => (
              <div key={stage.key}>
                <strong>{stage.label}:</strong> {stage.definition}
              </div>
            ))}
            <div>
              <strong>Contact Rate:</strong> {definitions.contactRate || 'Contacted ÷ Leads touched in this period.'}
            </div>
            <div>
              <strong>Reply Rate:</strong> {definitions.replyRate || 'Replied ÷ Delivered (unique leads).'}
            </div>
            <div>
              <strong>Booking Rate:</strong> {definitions.bookingRate || 'Booked ÷ Contacted (unique leads).'}
            </div>
          </div>
        </details>
      </div>

      <div className="space-y-5">
        {stages.map((stage, idx) => {
          const previousCount = idx === 0 ? stage.count : stages[idx - 1]?.count || 0;
          const pct = idx === 0 ? 1 : previousCount > 0 ? stage.count / previousCount : 0;
          const dropOff = idx === 0 ? 0 : 1 - pct;

          return (
            <div
              key={stage.key}
              className="rounded-[12px] border border-surface-line bg-surface-bg px-4 py-3 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider">{stage.label}</div>
                  <div className="text-3xl font-bold text-ink-1">{stage.count.toLocaleString()}</div>
                </div>
                <div className="text-right text-xs text-ink-2">
                  <div>Stage conversion</div>
                  <div className="text-lg font-semibold text-ink-1">{Math.round(pct * 100)}%</div>
                </div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-surface-line overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${stageGradient(idx)}`}
                  style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }}
                />
              </div>
              {idx > 0 && (
                <div className="mt-2 text-xs text-ink-2">
                  Drop-off vs previous: {Math.round(dropOff * 100)}%
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3 text-xs text-ink-2">
        <div className="p-4 rounded-[12px] border border-surface-line bg-surface-bg">
          <div className="uppercase tracking-wider font-semibold text-ink-2">Contact Rate</div>
          <div className="text-2xl font-bold text-ink-1">{Math.round((rates.contactRate ?? 0) * 100)}%</div>
        </div>
        <div className="p-4 rounded-[12px] border border-surface-line bg-surface-bg">
          <div className="uppercase tracking-wider font-semibold text-ink-2">Reply Rate</div>
          <div className="text-2xl font-bold text-ink-1">{Math.round((rates.replyRate ?? 0) * 100)}%</div>
        </div>
        <div className="p-4 rounded-[12px] border border-surface-line bg-surface-bg">
          <div className="uppercase tracking-wider font-semibold text-ink-2">Booking Rate</div>
          <div className="text-2xl font-bold text-ink-1">{Math.round((rates.bookingRate ?? 0) * 100)}%</div>
        </div>
      </div>
    </ChartCard>
  );
}
