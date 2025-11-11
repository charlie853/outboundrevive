"use client";
import React from 'react';

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
  const steps = [
    { 
      label: 'Leads', 
      value: data.leads, 
      percent: 100,
      description: 'Total leads in your system'
    },
    { 
      label: 'Contacted', 
      value: data.contacted, 
      percent: data.leads > 0 ? Math.round((data.contacted / data.leads) * 100) : 0,
      description: 'Leads with at least one outbound message'
    },
    { 
      label: 'Delivered', 
      value: data.delivered, 
      percent: data.contacted > 0 ? Math.round((data.delivered / data.contacted)) : 0, // Avg msgs per contacted lead
      description: 'Messages successfully delivered'
    },
    { 
      label: 'Replied', 
      value: data.replied, 
      percent: data.contacted > 0 ? Math.round((data.replied / data.contacted) * 100) : 0,
      description: 'Leads who responded'
    },
    { 
      label: 'Booked', 
      value: data.booked ?? 0, 
      percent: data.contacted > 0 ? Math.round(((data.booked ?? 0) / data.contacted) * 100) : 0,
      description: 'Leads who scheduled an appointment'
    },
  ];
  const max = Math.max(...steps.map(s => s.value), 1);
  
  return (
    <div className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-lg" aria-label="Conversion Funnel">
      <div className="mb-1 text-xl font-bold text-slate-900">Conversion Funnel</div>
      <div className="mb-6 text-sm text-slate-600">Track how leads progress from initial contact to booking</div>
      <ul className="space-y-3">
        {steps.map((s, idx) => (
          <li key={s.label} className="group">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-32 text-sm font-semibold text-slate-800">{s.label}</div>
              <div className="relative h-10 flex-1 rounded-lg bg-slate-100 overflow-hidden shadow-inner">
                <div 
                  className={`absolute inset-y-0 left-0 rounded-lg transition-all duration-500 ${
                    idx === 0 ? 'bg-gradient-to-r from-slate-600 to-slate-700' :
                    idx === 1 ? 'bg-gradient-to-r from-indigo-600 to-indigo-700' :
                    idx === 2 ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                    idx === 3 ? 'bg-gradient-to-r from-purple-500 to-purple-600' :
                    'bg-gradient-to-r from-amber-500 to-orange-500'
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
              <div className="w-24 text-right text-sm font-bold tabular-nums text-slate-900">
                {s.value.toLocaleString()}
              </div>
            </div>
            <div className="ml-32 text-xs text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
              {s.description}
            </div>
          </li>
        ))}
      </ul>
      
      {/* Conversion Summary - Key Metrics */}
      <div className="mt-6 pt-6 border-t border-slate-200">
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200">
            <div className="text-xs font-medium text-slate-600 mb-1">Contact Rate</div>
            <div className="text-2xl font-bold text-indigo-900">
              {data.leads > 0 ? Math.round((data.contacted / data.leads) * 100) : 0}%
            </div>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200">
            <div className="text-xs font-medium text-slate-600 mb-1">Reply Rate</div>
            <div className="text-2xl font-bold text-purple-900">
              {data.contacted > 0 ? Math.round((data.replied / data.contacted) * 100) : 0}%
            </div>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200">
            <div className="text-xs font-medium text-slate-600 mb-1">Booking Rate</div>
            <div className="text-2xl font-bold text-amber-900">
              {data.contacted > 0 ? Math.round(((data.booked ?? 0) / data.contacted) * 100) : 0}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

