"use client";
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { ReplyPoint } from '@/lib/types/metrics';

const replyDefinitions = `Replies counts inbound SMS received from leads within each bucket (based on account timezone).`;

export default function RepliesChart({ days }: { days: ReplyPoint[] }) {
  const safeDays = Array.isArray(days) ? days : [];
  const labels = useMemo(() => safeDays.map((x) => x?.label ?? ''), [safeDays]);
  const inboundData = useMemo(() => safeDays.map((x) => x?.replies ?? 0), [safeDays]);

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
      data: labels,
      axisLine: { lineStyle: { color: '#6B7280' } },
      axisLabel: { color: '#374151' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(226, 232, 240, 0.25)', type: 'dashed' } },
      axisLabel: { color: '#374151' },
    },
    series: [
      {
        name: 'Replies',
        type: 'line',
        data: inboundData,
        smooth: true,
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(245, 158, 11, 0.2)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0)' },
            ],
          },
        },
        lineStyle: { color: '#F59E0B', width: 3 },
        itemStyle: { color: '#F59E0B' },
      },
    ],
  };

  return (
    <div aria-label="Replies per day">
      <div className="flex items-start justify-between text-xs text-ink-2 mb-4">
        <span>Inbound replies from leads over time</span>
        <details className="relative text-warning">
          <summary className="cursor-pointer hover:opacity-80 underline decoration-dotted list-none">
            Definitions
          </summary>
          <div className="absolute z-50 right-0 mt-2 p-3 text-xs text-ink-1 bg-surface-card border border-surface-line rounded-xl shadow-lg max-w-xs">
            {replyDefinitions}
          </div>
        </details>
      </div>
      <ReactECharts option={option} style={{ height: '300px' }} />
    </div>
  );
}
