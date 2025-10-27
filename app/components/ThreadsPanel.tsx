'use client'
"use client";
import useSWR from "swr";

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store', credentials: 'include' }).then((r) => r.json());

export default function ThreadsPanel() {
  const { data, error, isLoading } = useSWR('/api/threads?limit=20', fetcher, { refreshInterval: 10_000 });
  if (error) return <div className="rounded-lg border p-4">Threads error.</div>;
  if (isLoading || !data?.ok) return <div className="rounded-lg border p-4">Loading…</div>;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <a className="ml-auto underline text-sm" href="/leads">Open leads</a>
      </div>
      <ul className="space-y-3">
        {data.threads.map((t: any, i: number) => (
          <li key={i} className="rounded-md border p-3">
            <div className="text-sm text-gray-600">
              {t.lead_name ?? 'Unknown'} <span className="text-gray-400">({t.lead_phone ?? '—'})</span>
            </div>
            <div className="mt-1 line-clamp-2">{t.last_message}</div>
            <div className="mt-1 text-xs text-gray-400">{new Date(t.last_at).toLocaleString()}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
