'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

type Thread = {
  id: string;
  subject: string | null;
  labels: string[];
  assignee_id: string | null;
  last_message_at: string;
  email_campaigns?: { name: string } | null;
  leads?: { name: string; email: string | null } | null;
};

export default function EmailUniboxPage() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }
      fetch('/api/email/unibox', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
        .then((data) => { setThreads(data.threads ?? []); setError(null); })
        .catch((e) => { setError(e?.message || 'Error'); setThreads([]); })
        .finally(() => setLoading(false));
    });
  }, []);

  if (loading) {
    return (
      <div className="mt-6 space-y-4">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-surface-bg" />
        <div className="rounded-xl border border-surface-border bg-surface-card p-6">
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-bg" />
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
          <h2 className="text-lg font-semibold text-ink-1">Unibox</h2>
          <p className="text-sm text-ink-2 mt-0.5">All email replies in one place. Open a thread to view messages and reply.</p>
        </div>
        {threads.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-ink-2">No threads yet.</p>
            <p className="text-sm text-ink-2 mt-1">Replies from your campaigns will appear here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-surface-border">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/dashboard/email/unibox/${t.id}`} className="block px-6 py-4 hover:bg-surface-bg/50 transition">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink-1 truncate">{t.subject || 'No subject'}</span>
                    <span className="text-xs text-ink-2 shrink-0">{new Date(t.last_message_at).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-ink-2 flex-wrap">
                    <span>{(t.leads as any)?.name}</span>
                    <span>·</span>
                    <span>{(t.email_campaigns as any)?.name}</span>
                    {Array.isArray(t.labels) && t.labels.length > 0 && (
                      <>
                        <span>·</span>
                        <span className="rounded bg-warning/10 px-1.5 py-0.5 text-xs text-warning">{t.labels.join(', ')}</span>
                      </>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
