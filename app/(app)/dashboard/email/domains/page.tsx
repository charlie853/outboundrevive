'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Domain = { id: string; domain: string; dns_status: Record<string, string>; verified_at: string | null };
type Inbox = { id: string; provider: string; email_address: string; daily_limit: number; health_score: number | null };

export default function EmailDomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }
      const h = { Authorization: `Bearer ${token}` };
      Promise.all([
        fetch('/api/email/domains', { headers: h }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Domains failed')))),
        fetch('/api/email/inboxes', { headers: h }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('Inboxes failed')))),
      ])
        .then(([d, i]) => {
          setDomains(d.domains ?? []);
          setInboxes(i.inboxes ?? []);
          setError(null);
        })
        .catch((e) => {
          setError(e?.message || 'Error');
          setDomains([]);
          setInboxes([]);
        })
        .finally(() => setLoading(false));
    });
  }, []);

  if (loading) {
    return (
      <div className="mt-6 space-y-6">
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
    <div className="mt-6 space-y-8">
      <div className="rounded-xl border border-surface-border bg-surface-card shadow-sm overflow-hidden">
        <div className="border-b border-surface-border px-6 py-4">
          <h2 className="text-lg font-semibold text-ink-1">Domains</h2>
          <p className="text-sm text-ink-2 mt-0.5">Sending domains and DNS status. Add a domain and verify SPF/DKIM/DMARC.</p>
        </div>
        {domains.length === 0 ? (
          <div className="p-8 text-center text-ink-2 text-sm">No domains added yet.</div>
        ) : (
          <ul className="divide-y divide-surface-border">
            {domains.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-6 py-4">
                <span className="font-medium text-ink-1">{d.domain}</span>
                <span className="text-xs text-ink-2">
                  SPF: {d.dns_status?.spf ?? '—'} · DMARC: {d.dns_status?.dmarc ?? '—'}
                  {d.verified_at ? ' · Verified' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-xl border border-surface-border bg-surface-card shadow-sm overflow-hidden">
        <div className="border-b border-surface-border px-6 py-4">
          <h2 className="text-lg font-semibold text-ink-1">Sending Inboxes</h2>
          <p className="text-sm text-ink-2 mt-0.5">Connected Gmail, Microsoft, or SMTP inboxes and daily send limits.</p>
        </div>
        {inboxes.length === 0 ? (
          <div className="p-8 text-center text-ink-2 text-sm">No inboxes connected yet.</div>
        ) : (
          <ul className="divide-y divide-surface-border">
            {inboxes.map((i) => (
              <li key={i.id} className="flex items-center justify-between px-6 py-4">
                <span className="font-medium text-ink-1">{i.email_address}</span>
                <span className="text-xs text-ink-2">{i.provider} · {i.daily_limit}/day</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
