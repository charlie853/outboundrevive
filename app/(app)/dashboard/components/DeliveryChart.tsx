"use client";
import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import type { DayPoint } from '@/lib/types/metrics';

export default function DeliveryChart({ days }: { days: DayPoint[] }) {
  const data = days.map(x => ({ d: x.d.slice(0,10), sent: x.sent, delivered: x.delivered, failed: x.failed }));
  return (
    <div className="rounded-2xl border border-surface-line bg-surface-card p-4 shadow-soft" aria-label="Delivery over time">
      <div className="mb-2 text-sm text-ink-2">Delivery over time</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid vertical={false} stroke="#eee" />
            <XAxis dataKey="d" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="sent" stroke="#64748b" fill="#94a3b8" fillOpacity={0.25} />
            <Area type="monotone" dataKey="delivered" stroke="#10b981" fill="#34d399" fillOpacity={0.25} />
            <Area type="monotone" dataKey="failed" stroke="#ef4444" fill="#f87171" fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

