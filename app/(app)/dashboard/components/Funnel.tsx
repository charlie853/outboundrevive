"use client";
import React from 'react';

export default function Funnel({ data }: { data: { leads: number; sent: number; delivered: number; replied: number } }) {
  const steps = [
    { label: 'Leads', value: data.leads },
    { label: 'Contacted', value: data.sent },
    { label: 'Delivered', value: data.delivered },
    { label: 'Replied', value: data.replied },
  ];
  const max = Math.max(...steps.map(s => s.value), 1);
  return (
    <div className="rounded-2xl border border-surface-line bg-surface-card p-4 shadow-soft" aria-label="Funnel">
      <div className="mb-2 text-sm text-ink-2">Funnel</div>
      <ul className="space-y-3">
        {steps.map(s => (
          <li key={s.label} className="flex items-center gap-3">
            <div className="w-24 text-sm text-ink-2">{s.label}</div>
            <div className="relative h-3 flex-1 rounded-full bg-surface-bg">
              <div className="absolute inset-y-0 left-0 rounded-full bg-ink-1" style={{ width: `${(s.value / max) * 100}%` }} />
            </div>
            <div className="w-16 text-right text-sm tabular-nums text-ink-1">{s.value}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

