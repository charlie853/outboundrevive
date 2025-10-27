"use client";
import React, { useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  Legend,
} from 'recharts';
import type { DayPoint } from '@/lib/types/metrics';

export default function DeliveryChart({ days }: { days: DayPoint[] }) {
  const data = useMemo(
    () =>
      days.map((x) => ({
        d: x.d.slice(0, 10),
        sent: x.sent,
        delivered: x.delivered,
        failed: x.failed,
      })),
    [days],
  );

  return (
    <div className="rounded-2xl border border-surface-line bg-surface-card p-4 shadow-soft" aria-label="Delivery over time">
      <div className="mb-2 text-sm text-ink-2">Delivery over time</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid vertical={false} stroke="#eee" />
            <XAxis dataKey="d" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="delivered" stroke="#10b981" fill="#34d399" fillOpacity={0.25} name="delivered" />
            <Area type="monotone" dataKey="failed" stroke="#ef4444" fill="#f87171" fillOpacity={0.2} name="failed" />
            <Line type="monotone" dataKey="sent" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 2 }} name="sent" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
