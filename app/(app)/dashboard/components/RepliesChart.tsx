"use client";
import React from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DayPoint } from '@/lib/types/metrics';

export default function RepliesChart({ days }: { days: DayPoint[] }) {
  const data = days.map(x => ({ d: x.d.slice(0,10), inbound: x.inbound }));
  return (
    <div className="rounded-2xl border border-surface-line bg-surface-card p-4 shadow-soft" aria-label="Replies per day">
      <div className="mb-2 text-sm text-ink-2">Replies per day</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid vertical={false} stroke="#eee" />
            <XAxis dataKey="d" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="inbound" fill="#6366f1" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

