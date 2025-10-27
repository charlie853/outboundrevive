'use client';

import useSWR from 'swr';
import { useState } from 'react';

const fetcher = (url: string) => fetch(url, { credentials: 'same-origin' }).then(r => r.json());

type DeliveryRow = { date: string; sent: number; delivered: number; failed: number };
type ReplyRow = { date: string; replies: number };

type Funnel = { leads: number; contacted: number; delivered: number; replied: number };

type MetricsResponse = {
  ok: boolean;
  kpis?: {
    newLeads: number;
    messagesSent: number;
    deliveredPct: number;
    replies: number;
  };
  charts?: {
    deliveryOverTime: DeliveryRow[];
    repliesPerDay: ReplyRow[];
  };
  funnel?: Funnel;
};

export default function MetricsPanel() {
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('7d');
  const { data, error, isLoading } = useSWR<MetricsResponse>(`/api/metrics?range=${range}`, fetcher, {
    refreshInterval: 15_000,
  });

  const unavailable = !!error || !data?.ok;

  const kpis = {
    newLeads: data?.kpis?.newLeads ?? 0,
    messagesSent: data?.kpis?.messagesSent ?? 0,
    deliveredPct: data?.kpis?.deliveredPct ?? 0,
    replies: data?.kpis?.replies ?? 0,
  };

  const delivery = data?.charts?.deliveryOverTime ?? [];
  const repliesPerDay = data?.charts?.repliesPerDay ?? [];
  const funnel: Funnel = data?.funnel ?? { leads: 0, contacted: 0, delivered: 0, replied: 0 };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(['7d', '30d', '90d'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1 rounded border ${range === r ? 'bg-black text-white' : 'bg-white'}`}
          >
            {r.toUpperCase()}
          </button>
        ))}
      </div>

      {unavailable && (
        <div className="p-3 text-sm rounded border bg-yellow-50 text-yellow-700">
          Metrics temporarily unavailable. If you’re not signed in, please sign in and refresh.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="New Leads" value={kpis.newLeads} delta="+0%" />
        <Kpi title="Messages Sent" value={kpis.messagesSent} delta="+0%" />
        <Kpi title="Delivered %" value={`${kpis.deliveredPct}%`} delta="+0%" />
        <Kpi title="Replies" value={kpis.replies} delta="+0%" />
      </div>

      <Section title="Delivery over time">
        {isLoading ? (
          <Empty label="Loading…" />
        ) : delivery.length === 0 ? (
          <Empty label="No data yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1 pr-4">Date</th>
                  <th className="py-1 pr-4">delivered</th>
                  <th className="py-1 pr-4">failed</th>
                  <th className="py-1">sent</th>
                </tr>
              </thead>
              <tbody>
                {delivery.map((row) => (
                  <tr key={row.date} className="border-b last:border-0">
                    <td className="py-1 pr-4">{row.date}</td>
                    <td className="py-1 pr-4">{row.delivered}</td>
                    <td className="py-1 pr-4">{row.failed}</td>
                    <td className="py-1">{row.sent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Replies per day">
        {isLoading ? (
          <Empty label="Loading…" />
        ) : repliesPerDay.length === 0 ? (
          <Empty label="No replies yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1 pr-4">Date</th>
                  <th className="py-1">replies</th>
                </tr>
              </thead>
              <tbody>
                {repliesPerDay.map((row) => (
                  <tr key={row.date} className="border-b last:border-0">
                    <td className="py-1 pr-4">{row.date}</td>
                    <td className="py-1">{row.replies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Funnel">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label="Leads" value={funnel.leads} />
          <Tile label="Contacted" value={funnel.contacted} />
          <Tile label="Delivered" value={funnel.delivered} />
          <Tile label="Replied" value={funnel.replied} />
        </div>
      </Section>
    </div>
  );
}

function Kpi({ title, value, delta }: { title: string; value: string | number; delta: string }) {
  return (
    <div className="rounded border p-3 bg-white">
      <div className="text-sm text-gray-600">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="text-xs text-green-600">▲ {delta}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border bg-white p-3">
      <div className="font-medium mb-2">{title}</div>
      {children}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border p-3 bg-white">
      <div className="text-sm text-gray-600">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="text-sm text-gray-500">{label}</div>;
}
