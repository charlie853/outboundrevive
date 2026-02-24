'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function EmailLeadsPage() {
  const [leads, setLeads] = useState<{ id: string; name: string; email: string | null; company: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }
      fetch('/api/email/leads', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
        .then((data) => { setLeads(data.leads ?? []); setError(null); })
        .catch((e) => { setError(e?.message || 'Error'); setLeads([]); })
        .finally(() => setLoading(false));
    });
  }, []);

  if (loading) {
    return (
      <div className="mt-6 space-y-4">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-surface-bg" />
        <div className="rounded-xl border border-surface-border bg-surface-card p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
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
          <h2 className="text-lg font-semibold text-ink-1">Leads</h2>
          <p className="text-sm text-ink-2 mt-0.5">Leads with email for cold email campaigns. Add via CSV or CRM sync.</p>
        </div>
        {leads.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-ink-2">No leads with email yet.</p>
            <p className="text-sm text-ink-2 mt-1">Import leads via CSV or connect your CRM to sync contacts.</p>
          </div>
        ) : (
          <ul className="divide-y divide-surface-border">
            {leads.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-6 py-4 hover:bg-surface-bg/50 transition">
                <span className="font-medium text-ink-1">{l.name}</span>
                <span className="text-sm text-ink-2">{l.email}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
