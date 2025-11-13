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
      splitLine: { lineStyle: { color: '#E5E7EB', type: 'dashed' } },
      axisLabel: { color: '#374151' },
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
    <div aria-label="Replies per day">
      <div className="flex items-start justify-between text-xs text-gray-700 mb-4">
        <span>Inbound replies from leads over time</span>
        <button
          type="button"
          className="text-amber-500 underline decoration-dotted"
          title={replyDefinitions}
        >
          Definitions
        </button>
      </div>
      <ReactECharts option={option} style={{ height: '300px' }} />
    </div>
  );
}

