'use client';
import React, { useState } from 'react';
import { StatCard } from '@/app/components/StatCard';
import type { Kpis } from '@/lib/types/metrics';

type MetricItem = {
  label: string;
  value: number;
  delta: number;
  description: string;
  accentColor?: 'brand' | 'warning' | 'success' | 'danger';
};

export default function KpiCards({ data, className = '' }: { data: Kpis & { booked?: number; contacted?: number; optedOut?: number; replyRate?: number; optOutRate?: number; appointmentsBooked?: number; reEngaged?: number }; className?: string }) {
  const items: MetricItem[] = [
    {
      label: 'New Leads',
      value: data.leadsNew,
      delta: data.deltas.leadsNew,
      description: 'Total leads added to OutboundRevive in this period',
      accentColor: 'brand',
    },
    {
      label: 'Contacted',
      value: data.contacted ?? 0,
      delta: 0,
      description: 'Leads with at least one outbound message sent',
      accentColor: 'brand',
    },
    {
      label: 'Replies',
      value: data.replies,
      delta: data.deltas.replies,
      description: 'Total inbound messages received from leads',
      accentColor: 'brand',
    },
    {
      label: 'Reply Rate',
      value: Math.round((data.replyRate || 0) * 100),
      delta: 0,
      description: 'Percentage of delivered messages that received a reply',
      accentColor: 'warning',
    },
    {
      label: 'Booked',
      value: data.booked ?? data.appointmentsBooked ?? 0,
      delta: 0,
      description: 'Appointments scheduled via Calendly, Cal.com, or booking link',
      accentColor: 'warning',
    },
    {
      label: 'Opt-Outs',
      value: data.optedOut ?? 0,
      delta: 0,
      description: 'Leads who requested to stop receiving messages (replied PAUSE/STOP)',
      accentColor: 'danger',
    },
    {
      label: 'Re-engaged',
      value: data.reEngaged ?? 0,
      delta: 0,
      description: 'Leads who replied after 30+ days of no contact',
      accentColor: 'success',
    },
  ];

  return (
    <div className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {items.map((k) => (
        <MetricCard key={k.label} item={k} />
      ))}
    </div>
  );
}

function MetricCard({ item }: { item: MetricItem }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const formatValue = () => {
    if (item.label === 'Reply Rate') {
      return `${item.value ?? 0}%`;
    }
    return (item.value ?? 0).toLocaleString();
  };

  const subtext = item.delta !== 0
    ? `${item.delta >= 0 ? '↗' : '↘'} ${Math.round(Math.abs(item.delta || 0) * 100)}% vs previous`
    : undefined;

  return (
    <StatCard
      title={item.label}
      value={formatValue()}
      subtext={subtext}
      accentColor={item.accentColor}
      className="relative"
    >
      <div
        className="absolute top-5 right-5"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <svg className="w-4 h-4 text-ink-2 hover:text-ink-1 cursor-help transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {showTooltip && (
          <div className="absolute z-50 right-0 top-6 w-64 p-3 text-xs text-ink-1 bg-surface-card border border-surface-line rounded-xl shadow-lg">
            {item.description}
          </div>
        )}
      </div>
    </StatCard>
  );
}

