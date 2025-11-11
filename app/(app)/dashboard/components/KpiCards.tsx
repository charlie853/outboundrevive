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

  // Choose card accent color based on metric type
  const getAccentColor = (label: string) => {
    if (label === 'New Leads') return 'from-slate-600 to-slate-700';
    if (label === 'Contacted') return 'from-indigo-600 to-indigo-700';
    if (label === 'Replies') return 'from-purple-500 to-purple-600';
    if (label === 'Reply Rate') return 'from-purple-500 to-purple-600';
    if (label === 'Booked') return 'from-amber-500 to-orange-500';
    if (label === 'Opt-Outs') return 'from-rose-500 to-rose-600';
    return 'from-indigo-600 to-indigo-700';
  };

  return (
    <div className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] relative">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-slate-700">{item.label}</div>
        <div 
          className="relative group"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <svg className="w-5 h-5 text-indigo-400 hover:text-indigo-600 cursor-help transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {showTooltip && (
            <div className="absolute z-50 right-0 top-7 w-72 p-3 text-xs text-slate-700 bg-white border border-indigo-200 rounded-xl shadow-2xl">
              {item.description}
            </div>
          )}
        </div>
      </div>
      
      {/* Metric Value with gradient accent */}
      <div className="relative">
        <div className={`text-4xl font-black bg-gradient-to-r ${getAccentColor(item.label)} bg-clip-text text-transparent`}>
          {(item.label === 'Delivered %' || item.label === 'Reply Rate') ? `${item.value}%` : item.value.toLocaleString()}
        </div>
      </div>
      
      {/* Delta indicator */}
      {item.delta !== 0 && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-semibold ${item.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}> 
          <span className="text-base">{item.delta >= 0 ? '↗' : '↘'}</span>
          <span>{Math.round(Math.abs(item.delta || 0) * 100)}% vs previous</span>
        </div>
      )}
    </div>
  );
}

