'use client';
import React, { useState } from 'react';
import type { Kpis } from '@/lib/types/metrics';

type MetricItem = {
  label: string;
  value: number;
  delta: number;
  description: string;
};

export default function KpiCards({ data, className = '' }: { data: Kpis & { booked?: number; contacted?: number; optedOut?: number; replyRate?: number; optOutRate?: number }; className?: string }) {
  const items: MetricItem[] = [
    {
      label: 'New Leads',
      value: data.leadsNew,
      delta: data.deltas.leadsNew,
      description: 'Total leads added to OutboundRevive in this period'
    },
    {
      label: 'Contacted',
      value: data.contacted ?? 0,
      delta: 0,
      description: 'Leads with at least one outbound message sent'
    },
    {
      label: 'Replies',
      value: data.replies,
      delta: data.deltas.replies,
      description: 'Total inbound messages received from leads'
    },
    {
      label: 'Reply Rate',
      value: Math.round((data.replyRate || 0) * 100),
      delta: 0,
      description: 'Percentage of delivered messages that received a reply'
    },
    {
      label: 'Booked',
      value: data.booked ?? 0,
      delta: 0,
      description: 'Leads who scheduled or confirmed an appointment'
    },
    {
      label: 'Opt-Outs',
      value: data.optedOut ?? 0,
      delta: 0,
      description: 'Leads who requested to stop receiving messages (replied PAUSE/STOP)'
    },
  ];

  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {items.map((k) => (
        <MetricCard key={k.label} item={k} />
      ))}
    </div>
  );
}

function MetricCard({ item }: { item: MetricItem }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="grad-border-amber p-5 transition-shadow relative text-white">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-300">{item.label}</div>
        <div 
          className="relative group"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <svg className="w-4 h-4 text-amber-400 hover:text-amber-300 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {showTooltip && (
            <div className="absolute z-50 right-0 top-6 w-64 p-3 text-xs text-gray-200 bg-indigo-950/80 border border-amber-300/40 rounded-lg shadow-xl backdrop-blur">
              {item.description}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 text-3xl font-bold text-white">
        {(item.label === 'Delivered %' || item.label === 'Reply Rate') ? `${item.value}%` : item.value.toLocaleString()}
      </div>
      {item.delta !== 0 && (
        <div className={`mt-1 text-xs font-medium ${item.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}> 
          {item.delta >= 0 ? '▲' : '▼'} {Math.round(Math.abs(item.delta || 0) * 100)}% vs previous period
        </div>
      )}
    </div>
  );
}

