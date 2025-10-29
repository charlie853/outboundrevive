'use client';
import React, { useState } from 'react';
import type { Kpis } from '@/lib/types/metrics';

type MetricItem = {
  label: string;
  value: number;
  delta: number;
  description: string;
};

export default function KpiCards({ data, className = '' }: { data: Kpis; className?: string }) {
  const items: MetricItem[] = [
    {
      label: 'New Leads',
      value: data.leadsNew,
      delta: data.deltas.leadsNew,
      description: 'Total leads added to OutboundRevive in this period'
    },
    {
      label: 'Messages Sent',
      value: data.sent,
      delta: data.deltas.sent,
      description: 'Total outbound SMS messages sent by the AI'
    },
    {
      label: 'Delivered %',
      value: Math.round((data.deliveredRate || 0) * 100),
      delta: data.deltas.deliveredRate,
      description: 'Percentage of sent messages successfully delivered (excludes failed/invalid numbers)'
    },
    {
      label: 'Replies',
      value: data.replies,
      delta: data.deltas.replies,
      description: 'Total inbound messages received from leads'
    },
  ];

  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
      {items.map((k) => (
        <MetricCard key={k.label} item={k} />
      ))}
    </div>
  );
}

function MetricCard({ item }: { item: MetricItem }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="rounded-2xl border border-surface-line bg-surface-card p-5 shadow-soft relative">
      <div className="flex items-center justify-between">
        <div className="text-sm text-ink-2">{item.label}</div>
        <div 
          className="relative group"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <svg className="w-4 h-4 text-ink-3 hover:text-ink-2 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {showTooltip && (
            <div className="absolute z-50 right-0 top-6 w-64 p-3 text-xs text-ink-2 bg-surface-card border border-surface-line rounded-lg shadow-lg">
              {item.description}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 text-3xl font-semibold text-ink-1">
        {item.label === 'Delivered %' ? `${item.value}%` : item.value.toLocaleString()}
      </div>
      <div className={`mt-1 text-xs ${item.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}> 
        {item.delta >= 0 ? '▲' : '▼'} {Math.round(Math.abs(item.delta || 0) * 100)}% vs previous period
      </div>
    </div>
  );
}

