"use client";
import React from 'react';
import { ChartCard } from '@/app/components/StatCard';

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
              </div>
            </div>
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
        </div>
      </div>
    </ChartCard>
  );
}

