import React from 'react';
import type { Kpis } from '@/lib/types/metrics';

export default function KpiCards({ data, className = '' }: { data: Kpis; className?: string }) {
  const items = [
    { label: 'New Leads', value: data.leadsNew, delta: data.deltas.leadsNew },
    { label: 'Messages Sent', value: data.sent, delta: data.deltas.sent },
    { label: 'Delivered %', value: Math.round((data.deliveredRate || 0) * 100), delta: data.deltas.deliveredRate },
    { label: 'Replies', value: data.replies, delta: data.deltas.replies },
  ];
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
      {items.map((k) => (
        <div key={k.label} className="rounded-2xl border border-surface-line bg-surface-card p-5 shadow-soft">
          <div className="text-sm text-ink-2">{k.label}</div>
          <div className="mt-2 text-3xl font-semibold text-ink-1">{k.label === 'Delivered %' ? `${k.value}%` : k.value}</div>
          <div className={`mt-1 text-xs ${k.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}> 
            {k.delta >= 0 ? '▲' : '▼'} {Math.round(Math.abs(k.delta || 0) * 100)}%
          </div>
        </div>
      ))}
    </div>
  );
}

