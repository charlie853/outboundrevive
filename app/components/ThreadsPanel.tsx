'use client';

import useSWR from 'swr';

const fetcher = (url: string) =>
  fetch(url, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : Promise.reject(r)));

type Thread = {
  lead_phone: string | null;
  lead_name: string | null;
  last_message: string;
  last_at: string;
};

export default function ThreadsPanel() {
  const { data, error, isLoading } = useSWR<{ ok: boolean; threads?: Thread[] }>(
    '/api/threads?limit=50',
    fetcher,
    { refreshInterval: 15_000 }
  );

  if (error) {
    return (
      <div className="rounded border p-3 bg-white">
        <div className="font-medium mb-2">Recent activity</div>
        <div className="text-sm text-gray-500">
          Can’t load threads. If you’re not signed in, please sign in and refresh.
        </div>
      </div>
    );
  }

  const threads = (data?.threads ?? []) as Thread[];

  return (
    <div className="rounded border p-3 bg-white">
      <div className="font-medium mb-2">Recent activity</div>
      {isLoading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : threads.length === 0 ? (
        <div className="text-sm text-gray-500">No recent messages yet.</div>
      ) : (
        <ul className="divide-y">
          {threads.map((t, i) => (
            <li key={i} className="py-2">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-medium">{t.lead_name || t.lead_phone || 'Unknown'}</div>
                <div className="text-xs text-gray-500">{new Date(t.last_at).toLocaleString()}</div>
              </div>
              <div className="text-sm text-gray-700 whitespace-pre-line mt-1">{t.last_message}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
