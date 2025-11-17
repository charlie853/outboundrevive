"use client";
import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { DeliveryPoint } from '@/lib/types/metrics';

<<<<<<< HEAD
export default function DeliveryChart({ days }: { days: DayPoint[] }) {
  const safeDays = Array.isArray(days) ? days : [];
  const dates = useMemo(() => safeDays.map(x => x?.d?.slice(5, 10) || ''), [safeDays]);
  const sentData = useMemo(() => safeDays.map(x => x?.sent ?? 0), [safeDays]);
  const deliveredData = useMemo(() => safeDays.map(x => x?.delivered ?? 0), [safeDays]);
  const failedData = useMemo(() => safeDays.map(x => x?.failed ?? 0), [safeDays]);
=======
const deliveryDefinitions = `Sent: Outbound SMS attempts. Delivered: Carrier confirmed delivery. Failed: Carrier reported failed/undelivered. Pending: Awaiting receipt. Delivered% = Delivered ÷ Sent (per bucket).`;

export default function DeliveryChart({ days }: { days: DeliveryPoint[] }) {
  const safeDays = Array.isArray(days) ? days : [];
  const labels = useMemo(() => safeDays.map((x) => x?.label ?? ''), [safeDays]);
  const sentData = useMemo(() => safeDays.map((x) => x?.sent ?? 0), [safeDays]);
  const deliveredData = useMemo(() => safeDays.map((x) => x?.delivered ?? 0), [safeDays]);
  const failedData = useMemo(() => safeDays.map((x) => x?.failed ?? 0), [safeDays]);
  const deliveredPctData = useMemo(() => safeDays.map((x) => Math.round((x?.deliveredPct ?? 0) * 100)), [safeDays]);
>>>>>>> b4bbe092fd40bca3fce1414f1e4f12a7923bad6a

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: '#4F46E5',
      textStyle: { color: '#fff' },
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const idx = params[0]?.dataIndex ?? 0;
        const label = labels[idx] ?? '';
        const sent = sentData[idx] ?? 0;
        const delivered = deliveredData[idx] ?? 0;
        const failed = failedData[idx] ?? 0;
        const deliveredPct = deliveredPctData[idx] ?? 0;
        return [
          `<strong>${label}</strong>`,
          `Sent: ${sent}`,
          `Delivered: ${delivered}`,
          `Failed: ${failed}`,
          `Delivered%: ${deliveredPct}%`,
        ].join('<br/>');
      },
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
<<<<<<< HEAD
      data: dates,
=======
      data: labels,
>>>>>>> b4bbe092fd40bca3fce1414f1e4f12a7923bad6a
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
<<<<<<< HEAD
      <div className="text-xs text-gray-700 mb-4">Track sent, delivered, and failed messages over time</div>
=======
      <div className="flex items-start justify-between text-xs text-gray-700 mb-4">
        <span>Track sent, delivered, and failed messages over time</span>
        <button
          type="button"
          className="text-indigo-500 underline decoration-dotted"
          title={deliveryDefinitions}
        >
          Definitions
        </button>
      </div>
>>>>>>> b4bbe092fd40bca3fce1414f1e4f12a7923bad6a
      <ReactECharts option={option} style={{ height: '300px' }} />
    </div>
  );
}
