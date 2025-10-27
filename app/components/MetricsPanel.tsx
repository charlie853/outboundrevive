"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function MetricsPanel() {
  const { data, error, isLoading } = useSWR("/api/metrics", fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });

  if (isLoading) return <div className="p-4 rounded border">Loading metrics…</div>;
  if (error || !data?.ok) {
    return (
      <div className="p-4 rounded border border-red-300 text-red-700">
        Metrics temporarily unavailable. If you’re not signed in, please sign in and refresh.
      </div>
    );
  }

  const m = data;
  return (
    <div className="p-4 rounded border bg-white space-y-3">
      <div className="text-lg font-semibold">Last 24h</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Sent" value={m.out24} />
        <Stat label="Received" value={m.in24} />
        <Stat label="Reminders" value={m.reminders24} />
        <Stat label="Paused" value={m.paused} />
      </div>
      <div className="text-sm text-gray-600">7-day trend (counts/day)</div>
      <Trend label="Out" series={m.series?.out || []} />
      <Trend label="In" series={m.series?.in || []} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="p-3 rounded border">
      <div className="text-gray-500 text-sm">{label}</div>
      <div className="text-2xl font-bold">{value ?? 0}</div>
    </div>
  );
}

function Trend({ label, series }: { label: string; series: { date: string; count: number }[] }) {
  return (
    <div className="text-sm">
      <div className="font-medium">{label}</div>
      <div className="font-mono whitespace-pre overflow-x-auto">
        {series.map((p) => `${p.date.slice(5)}:${String(p.count).padStart(2, " ")} `).join(" ")}
      </div>
    </div>
  );
}

