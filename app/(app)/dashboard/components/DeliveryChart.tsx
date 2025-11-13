"use client";
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { DayPoint } from '@/lib/types/metrics';

export default function DeliveryChart({ days }: { days: DayPoint[] }) {
  const safeDays = Array.isArray(days) ? days : [];
  const dates = useMemo(() => safeDays.map(x => x?.d?.slice(5, 10) || ''), [safeDays]);
  const sentData = useMemo(() => safeDays.map(x => x?.sent ?? 0), [safeDays]);
  const deliveredData = useMemo(() => safeDays.map(x => x?.delivered ?? 0), [safeDays]);
  const failedData = useMemo(() => safeDays.map(x => x?.failed ?? 0), [safeDays]);

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
      textStyle: { color: '#1F2937' },
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
        lineStyle: { color: '#EF4444', width: 2 },
        itemStyle: { color: '#EF4444' },
      },
    ],
  };

  return (
    <div aria-label="Delivery over time">
      <div className="text-xs text-gray-700 mb-4">Track sent, delivered, and failed messages over time</div>
      <ReactECharts option={option} style={{ height: '300px' }} />
    </div>
  );
}
