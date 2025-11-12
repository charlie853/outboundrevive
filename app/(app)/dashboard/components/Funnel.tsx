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
    <div className="grad-border-amber p-6" aria-label="Conversion Funnel">
      <div className="mb-1 text-lg font-bold text-white">Conversion Funnel</div>
      <div className="mb-4 text-sm text-gray-300">Track how leads progress from initial contact to engagement</div>
      <ul className="space-y-4">
        {steps.map((s, idx) => (
          <li key={s.label} className="flex items-center gap-3">
            <div className="w-28 text-sm font-medium text-gray-300">{s.label}</div>
            <div className="relative h-8 flex-1 rounded-lg bg-white/10 overflow-hidden">
              <div 
                className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-300" 
                style={{ width: `${(s.value / max) * 100}%` }}
              />
              {s.value > 0 && (
                <div className="absolute inset-0 flex items-center px-3 text-xs font-medium text-white z-10">
                  {s.percent}%
                </div>
              )}
            </div>
            <div className="w-20 text-right text-sm font-semibold tabular-nums text-white">
              {s.value.toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
      
      {/* Conversion Summary */}
      <div className="mt-6 pt-4 border-t border-white/20">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="text-gray-300 font-medium">Contact Rate</div>
            <div className="text-2xl font-bold text-white mt-1">
              {data.leads > 0 ? Math.round((data.sent / data.leads) * 100) : 0}%
            </div>
          </div>
          <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <div className="text-gray-300 font-medium">Reply Rate</div>
            <div className="text-2xl font-bold text-amber-400 mt-1">
              {data.delivered > 0 ? Math.round((data.replied / data.delivered) * 100) : 0}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

