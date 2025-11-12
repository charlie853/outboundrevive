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
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      axisLabel: { color: '#E5E7EB' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' } },
      axisLabel: { color: '#E5E7EB' },
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
    <div className="grad-border-amber p-5" aria-label="Replies per day">
      <div className="mb-3 text-base font-semibold text-white">Lead Engagement</div>
      <div className="text-sm text-gray-300 mb-4">Inbound replies from leads by day</div>
      <ReactECharts option={option} style={{ height: '280px' }} />
    </div>
  );
}

