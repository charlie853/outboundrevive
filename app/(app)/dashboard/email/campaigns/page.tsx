'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function EmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; status: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }
      fetch('/api/email/campaigns', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
        .then((data) => { setCampaigns(data.campaigns ?? []); setError(null); })
        .catch((e) => { setError(e?.message || 'Error'); setCampaigns([]); })
        .finally(() => setLoading(false));
    });
  }, []);

  if (loading) {
    return (
      <div className="mt-6 space-y-4">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-surface-bg" />
        <div className="rounded-xl border border-surface-border bg-surface-card p-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-bg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
        <button type="button" className="ml-3 rounded-lg border border-rose-300 px-3 py-1 text-xs font-medium" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="rounded-xl border border-surface-border bg-surface-card shadow-sm overflow-hidden">
        <div className="border-b border-surface-border px-6 py-4">
          <h2 className="text-lg font-semibold text-ink-1">Campaigns</h2>
          <p className="text-sm text-ink-2 mt-0.5">Create and manage cold email sequences.</p>
        </div>
        {campaigns.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-ink-2">No campaigns yet.</p>
            <p className="text-sm text-ink-2 mt-1">Campaigns can be created via API or the campaign builder (coming soon).</p>
          </div>
        ) : (
          <ul className="divide-y divide-surface-border">
            {campaigns.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-6 py-4 hover:bg-surface-bg/50 transition">
                <span className="font-medium text-ink-1">{c.name}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                  c.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                  c.status === 'draft' ? 'bg-slate-100 text-slate-700' :
                  c.status === 'paused' ? 'bg-amber-100 text-amber-800' : 'bg-ink-2/10 text-ink-2'
                }`}>
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
