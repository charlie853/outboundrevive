"use client";
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { DayPoint } from '@/lib/types/metrics';

export default function DeliveryChart({ days }: { days: DayPoint[] }) {
  const dates = useMemo(() => days.map(x => x.d.slice(5, 10)), [days]);
  const sentData = useMemo(() => days.map(x => x.sent), [days]);
  const deliveredData = useMemo(() => days.map(x => x.delivered), [days]);
  const failedData = useMemo(() => days.map(x => x.failed), [days]);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: '#4F46E5',
      textStyle: { color: '#fff' },
    },
    legend: {
      data: ['Sent', 'Delivered', 'Failed'],
      textStyle: { color: '#475569' },
      bottom: 0,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
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
        name: 'Delivered',
        type: 'line',
        data: deliveredData,
        smooth: true,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(99, 102, 241, 0.3)' },
              { offset: 1, color: 'rgba(99, 102, 241, 0.05)' },
            ],
          },
        },
        lineStyle: { color: '#6366F1', width: 3 },
        itemStyle: { color: '#6366F1' },
      },
      {
        name: 'Sent',
        type: 'line',
        data: sentData,
        smooth: true,
        lineStyle: { color: '#312E81', width: 2, type: 'dashed' },
        itemStyle: { color: '#312E81' },
      },
      {
        name: 'Failed',
        type: 'line',
        data: failedData,
        smooth: true,
        lineStyle: { color: '#F59E0B', width: 2 },
        itemStyle: { color: '#F59E0B' },
      },
    ],
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg" aria-label="Delivery over time">
      <div className="mb-3 text-base font-semibold text-slate-900">Message Delivery</div>
      <div className="text-sm text-slate-600 mb-4">Track sent, delivered, and failed messages over time</div>
      <ReactECharts option={option} style={{ height: '280px' }} />
    </div>
  );
}
