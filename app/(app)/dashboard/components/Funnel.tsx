"use client";
import React from 'react';

export default function Funnel({ data }: { data: { leads: number; sent: number; delivered: number; replied: number } }) {
  const steps = [
    { label: 'Leads', value: data.leads, percent: 100 },
    { 
      label: 'Contacted', 
      value: data.sent, 
      percent: data.leads > 0 ? Math.round((data.sent / data.leads) * 100) : 0 
    },
    { 
      label: 'Delivered', 
      value: data.delivered, 
      percent: data.sent > 0 ? Math.round((data.delivered / data.sent) * 100) : 0 
    },
    { 
      label: 'Replied', 
      value: data.replied, 
      percent: data.delivered > 0 ? Math.round((data.replied / data.delivered) * 100) : 0 
    },
  ];
  const max = Math.max(...steps.map(s => s.value), 1);
  
  return (
    <div className="rounded-2xl border border-surface-line bg-surface-card p-6 shadow-soft" aria-label="Conversion Funnel">
      <div className="mb-1 text-lg font-semibold text-ink-1">Conversion Funnel</div>
      <div className="mb-4 text-sm text-ink-2">Track how leads progress from initial contact to engagement</div>
      <ul className="space-y-4">
        {steps.map((s, idx) => (
          <li key={s.label} className="flex items-center gap-3">
            <div className="w-28 text-sm font-medium text-ink-2">{s.label}</div>
            <div className="relative h-8 flex-1 rounded-lg bg-surface-bg overflow-hidden">
              <div 
                className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-sky-500 to-sky-600 transition-all duration-300" 
                style={{ width: `${(s.value / max) * 100}%` }}
              />
              {s.value > 0 && (
                <div className="absolute inset-0 flex items-center px-3 text-xs font-medium text-white z-10">
                  {s.percent}%
                </div>
              )}
            </div>
            <div className="w-20 text-right text-sm font-semibold tabular-nums text-ink-1">
              {s.value.toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
      
      {/* Conversion Summary */}
      <div className="mt-6 pt-4 border-t border-surface-line">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-ink-2">Contact Rate</div>
            <div className="text-lg font-semibold text-ink-1">
              {data.leads > 0 ? Math.round((data.sent / data.leads) * 100) : 0}%
            </div>
          </div>
          <div>
            <div className="text-ink-2">Reply Rate</div>
            <div className="text-lg font-semibold text-ink-1">
              {data.delivered > 0 ? Math.round((data.replied / data.delivered) * 100) : 0}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

