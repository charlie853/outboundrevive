"use client";
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { DayPoint } from '@/lib/types/metrics';

export default function RepliesChart({ days }: { days: DayPoint[] }) {
  const dates = useMemo(() => days.map(x => x.d.slice(5, 10)), [days]);
  const inboundData = useMemo(() => days.map(x => x.inbound), [days]);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: '#F59E0B',
      textStyle: { color: '#fff' },
      formatter: (params: any) => {
        const p = params[0];
        return `${p.name}<br/><b>${p.value}</b> replies`;
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '8%',
      top: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: '#E2E8F0' } },
      axisLabel: { color: '#64748B' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#F1F5F9', type: 'dashed' } },
      axisLabel: { color: '#64748B' },
    },
    series: [
      {
        name: 'Replies',
        type: 'bar',
        data: inboundData,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#F59E0B' },
              { offset: 1, color: '#FBBF24' },
            ],
          },
          borderRadius: [6, 6, 0, 0],
        },
        emphasis: {
          itemStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: '#D97706' },
                { offset: 1, color: '#F59E0B' },
              ],
            },
          },
        },
      },
    ],
  };

  return (
    <div className="rounded-2xl border border-indigo-200 bg-white p-6 shadow-lg" aria-label="Replies per day">
      <div className="mb-2 text-lg font-bold text-slate-900">Lead Engagement</div>
      <div className="text-sm text-slate-600 mb-4">Inbound replies from leads over time</div>
      <ReactECharts option={option} style={{ height: '300px' }} />
    </div>
  );
}

