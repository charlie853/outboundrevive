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
      borderColor: '#F59E0B',
      textStyle: { color: '#fff' },
    },
    legend: {
      data: ['Sent', 'Delivered', 'Failed'],
      textStyle: { color: '#E5E7EB' },
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
              { offset: 0, color: 'rgba(245, 158, 11, 0.4)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0.05)' },
            ],
          },
        },
        lineStyle: { color: '#F59E0B', width: 3 },
        itemStyle: { color: '#F59E0B' },
      },
      {
        name: 'Sent',
        type: 'line',
        data: sentData,
        smooth: true,
        lineStyle: { color: 'rgba(255, 255, 255, 0.6)', width: 2, type: 'dashed' },
        itemStyle: { color: 'rgba(255, 255, 255, 0.6)' },
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
    <div className="grad-border-amber p-5" aria-label="Delivery over time">
      <div className="mb-3 text-base font-semibold text-white">Message Delivery</div>
      <div className="text-sm text-gray-300 mb-4">Track sent, delivered, and failed messages over time</div>
      <ReactECharts option={option} style={{ height: '280px' }} />
    </div>
  );
}
