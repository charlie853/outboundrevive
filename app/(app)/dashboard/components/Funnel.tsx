"use client";
import React from 'react';
import { ChartCard } from '@/app/components/StatCard';
<<<<<<< HEAD

/**
 * Conversion Funnel Component - FIXED LOGIC
 * 
 * Shows lead progression with correct, monotonic percentages:
 * - Leads (base, always 100%)
 * - Contacted (unique leads with ≥1 outbound, % of leads)
 * - Delivered (messages delivered, % relative to contacted)
 * - Replied (unique leads who replied, % of contacted)
 * - Booked (leads who booked, % of contacted)
 * 
 * KEY FIX: All percentages after "Leads" are calculated relative to the appropriate base
 * to ensure they never exceed 100% and form a logical funnel.
 */
export default function Funnel({ data }: { 
  data: { 
    leads: number; 
    contacted: number; 
    delivered: number; 
    replied: number;
    booked?: number;
  } 
}) {
  // Calculate percentages correctly:
  // - Contacted: % of leads we reached
  // - Delivered: we show this as a count, not % (since it's messages, not unique leads)
  // - Replied: % of contacted leads who replied
  // - Booked: % of contacted leads who booked
  const leads = data.leads ?? 0;
  const contacted = data.contacted ?? 0;
  const delivered = data.delivered ?? 0;
  const replied = data.replied ?? 0;
  const booked = data.booked ?? 0;

  const steps = [
    { 
      label: 'Leads', 
      value: leads, 
      percent: 100,
      description: 'Total leads in your system'
    },
    { 
      label: 'Contacted', 
      value: contacted, 
      percent: leads > 0 ? Math.round((contacted / leads) * 100) : 0,
      description: 'Leads with at least one outbound message'
    },
    { 
      label: 'Delivered', 
      value: delivered, 
      percent: contacted > 0 ? Math.round((delivered / contacted)) : 0, // Avg msgs per contacted lead
      description: 'Messages successfully delivered'
    },
    { 
      label: 'Replied', 
      value: replied, 
      percent: contacted > 0 ? Math.round((replied / contacted) * 100) : 0,
      description: 'Leads who responded'
    },
    { 
      label: 'Booked', 
      value: booked, 
      percent: contacted > 0 ? Math.round((booked / contacted) * 100) : 0,
      description: 'Leads who scheduled an appointment'
    },
  ];
  const max = Math.max(...steps.map(s => s.value), 1);
  
  return (
    <ChartCard title="Conversion Funnel" className="md:col-span-2">
      <div className="text-xs text-white/80 mb-6">Track how leads progress from initial contact to booking</div>
      <ul className="space-y-3">
        {steps.map((s, idx) => (
          <li key={s.label} className="group">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-32 text-sm font-semibold text-white">{s.label}</div>
              <div className="relative h-10 flex-1 rounded-lg bg-white/10 overflow-hidden shadow-inner">
                <div 
                  className={`absolute inset-y-0 left-0 rounded-lg transition-all duration-500 ${
                    idx === steps.length - 1 
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500' // Last stage (Booked) = success color
                      : 'bg-gradient-to-r from-indigo-500 to-indigo-600' // All other stages = primary color
                  }`}
                  style={{ width: `${(s.value / max) * 100}%` }}
                />
                {s.value > 0 && (
                  <div className="absolute inset-0 flex items-center justify-between px-3 z-10">
                    <span className="text-xs font-bold text-white">
                      {s.label === 'Delivered' ? `${s.percent} avg` : `${s.percent}%`}
                    </span>
                  </div>
                )}
              </div>
              <div className="w-24 text-right text-sm font-bold tabular-nums text-white">
                {(s.value ?? 0).toLocaleString()}
=======
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
        <div className="text-sm text-white/70">No funnel data available for this range.</div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Conversion Funnel" className="md:col-span-2">
      <div className="flex items-start justify-between text-xs text-white/80 mb-6">
        <span>
          Lead progression for the selected window ({rangeLabel}) •{' '}
          <span className="text-white/60">Bucketed with timezone {timezone}</span>
        </span>
        <details className="text-xs text-amber-200">
          <summary className="cursor-pointer text-amber-300 hover:text-amber-200 underline decoration-dotted">
            Definitions
          </summary>
          <div className="mt-2 space-y-1 text-white/70">
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
              className="rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm px-4 py-3 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white/80 uppercase tracking-wider">{stage.label}</div>
                  <div className="text-3xl font-bold text-white">{stage.count.toLocaleString()}</div>
                </div>
                <div className="text-right text-xs text-white/70">
                  <div>Stage conversion</div>
                  <div className="text-lg font-semibold text-white">{Math.round(pct * 100)}%</div>
                </div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${stageGradient(idx)}`}
                  style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }}
                />
>>>>>>> b4bbe092fd40bca3fce1414f1e4f12a7923bad6a
              </div>
              {idx > 0 && (
                <div className="mt-2 text-xs text-white/60">
                  Drop-off vs previous: {Math.round(dropOff * 100)}%
                </div>
              )}
            </div>
<<<<<<< HEAD
            <div className="ml-32 text-xs text-white/60 opacity-0 group-hover:opacity-100 transition-opacity">
              {s.description}
            </div>
          </li>
        ))}
      </ul>
      
      {/* Conversion Summary - Key Metrics */}
      <div className="mt-6 pt-6 border-t border-white/20">
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-white/10 border border-white/20">
            <div className="text-xs font-medium text-white/80 mb-1">Contact Rate</div>
            <div className="text-2xl font-bold text-white">
              {leads > 0 ? Math.round((contacted / leads) * 100) : 0}%
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white/10 border border-white/20">
            <div className="text-xs font-medium text-white/80 mb-1">Reply Rate</div>
            <div className="text-2xl font-bold text-white">
              {contacted > 0 ? Math.round((replied / contacted) * 100) : 0}%
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white/10 border border-amber-500/50">
            <div className="text-xs font-medium text-white/80 mb-1">Booking Rate</div>
            <div className="text-2xl font-bold text-white">
              {contacted > 0 ? Math.round((booked / contacted) * 100) : 0}%
            </div>
          </div>
=======
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3 text-xs text-white/80">
        <div className="p-4 rounded-xl border border-white/15 bg-white/10">
          <div className="uppercase tracking-wider font-semibold text-white/70">Contact Rate</div>
          <div className="text-2xl font-bold text-white">{Math.round((rates.contactRate ?? 0) * 100)}%</div>
        </div>
        <div className="p-4 rounded-xl border border-white/15 bg-white/10">
          <div className="uppercase tracking-wider font-semibold text-white/70">Reply Rate</div>
          <div className="text-2xl font-bold text-white">{Math.round((rates.replyRate ?? 0) * 100)}%</div>
        </div>
        <div className="p-4 rounded-xl border border-white/15 bg-white/10">
          <div className="uppercase tracking-wider font-semibold text-white/70">Booking Rate</div>
          <div className="text-2xl font-bold text-white">{Math.round((rates.bookingRate ?? 0) * 100)}%</div>
>>>>>>> b4bbe092fd40bca3fce1414f1e4f12a7923bad6a
        </div>
      </div>
    </ChartCard>
  );
}

