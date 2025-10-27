"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ThreadsPanel() {
  const { data, error, isLoading } = useSWR("/api/threads?limit=50", fetcher, {
    refreshInterval: 10_000,
  });

  if (isLoading) return <div className="p-4 rounded border">Loading threads…</div>;
  if (error || !data?.ok) {
    return (
      <div className="p-4 rounded border border-red-300 text-red-700">
        Couldn’t load threads.
      </div>
    );
  }

  const threads: any[] = data.threads || [];
  if (!threads.length) return <div className="p-4 rounded border">No conversations yet.</div>;

  return (
    <div className="p-4 rounded border bg-white">
      <div className="text-lg font-semibold mb-2">Recent Conversations</div>
      <ul className="divide-y">
        {threads.map((t) => (
          <li key={`${t.lead_phone}-${t.last_at}`} className="py-3">
            <div className="flex items-start gap-3">
              <div className="font-medium">{t.lead_name || t.lead_phone}</div>
              <div className="ml-auto text-xs text-gray-500">{new Date(t.last_at).toLocaleString()}</div>
            </div>
            <div className="text-gray-700 text-sm line-clamp-2">{t.last_message}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

