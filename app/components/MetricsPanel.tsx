'use client'
"use client";
import useSWR from 'swr';

const fetcher = (u: string) =>
  fetch(u, { cache: 'no-store', credentials: 'include' }).then((r) => r.json());

export default function MetricsPanel() {
  const { data, error, isLoading } = useSWR('/api/metrics', fetcher, {
    refreshInterval: 10_000,
  });

  if (error) return <div className="rounded-lg border p-4">Metrics error.</div>;
  if (isLoading || !data?.ok) return <div className="rounded-lg border p-4">Loading metrics…</div>;

  const newLeads24 = data.newLeads24 ?? 0;
  const out24 = data.out24 ?? 0;
  const in24 = data.in24 ?? 0;
  const deliveredPct24 = data.deliveredPct24 ?? 0;
  const reminders24 = data.reminders24 ?? 0;
  const paused = data.paused ?? 0;

  const delivery = data.charts?.deliveryOverTime ?? {
    sent: data.series?.out ?? [],
    delivered: [],
    failed: [],
  };
  const repliesPerDay = data.charts?.repliesPerDay ?? data.series?.in ?? [];
  const funnel = data.funnel ?? { leads: 0, contacted: 0, delivered: 0, replied: 0 };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
        <Stat k="New Leads" v={newLeads24} />
        <Stat k="Messages Sent" v={out24} />
        <Stat k="Delivered %" v={`${deliveredPct24}%`} />
        <Stat k="Replies" v={in24} />
        <Stat k="Reminders" v={reminders24} />
        <Stat k="Paused" v={paused} />
      </div>

      <ChartBlock
        title="Delivery over time"
        series={[
          { name: 'sent', data: delivery.sent },
          { name: 'delivered', data: delivery.delivered },
          { name: 'failed', data: delivery.failed },
        ]}
      />

      <ChartBlock
        title="Replies per day"
        series={[{ name: 'replies', data: repliesPerDay }]}
      />

      <FunnelBlock data={funnel} />
    </div>
  );
}

function Stat({ k, v }: { k: string; v: any }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-sm text-gray-500">{k}</div>
      <div className="text-2xl font-semibold">{v}</div>
    </div>
  );
}

function ChartBlock({ title, series }: { title: string; series: any[] }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-lg font-semibold mb-3">{title}</div>
      <pre className="text-xs text-gray-500 overflow-auto">{JSON.stringify(series, null, 2)}</pre>
    </div>
  );
}

function FunnelBlock({
  data,
}: {
  data: { leads: number; contacted: number; delivered: number; replied: number };
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-lg font-semibold mb-3">Funnel</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat k="Leads" v={data.leads} />
        <Stat k="Contacted" v={data.contacted} />
        <Stat k="Delivered" v={data.delivered} />
        <Stat k="Replied" v={data.replied} />
      </div>
    </div>
  );
}
