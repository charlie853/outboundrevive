'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import TopBar from '@/app/(app)/dashboard/components/TopBar';
import { supabase } from '@/lib/supabase';

type Message = { id: string; direction: string; subject: string | null; body_plain: string | null; sent_at: string | null; created_at: string };
type Thread = { id: string; subject: string | null; labels: string[]; assignee_id: string | null; email_campaigns?: { name: string }; leads?: { name: string; email: string | null } };

export default function UniboxThreadPage() {
  const params = useParams();
  const id = params?.id as string;
  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!id) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }
      fetch(`/api/email/unibox/threads/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
        .then((data) => {
          setThread(data.thread);
          setMessages(data.messages ?? []);
          setError(null);
        })
        .catch((e) => { setError(e?.message || 'Error'); setThread(null); setMessages([]); })
        .finally(() => setLoading(false));
    });
  };

  useEffect(() => { load(); }, [id]);

  const sendReply = () => {
    if (!replyBody.trim()) return;
    setSending(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) { setSending(false); return; }
      fetch(`/api/email/unibox/threads/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body_plain: replyBody.trim() }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Send failed'))))
        .then(() => { setReplyBody(''); load(); })
        .catch((e) => setError(e?.message || 'Send failed'))
        .finally(() => setSending(false));
    });
  };

  return (
    <div>
      <TopBar
        title="Thread"
        subtitle={thread ? (thread.leads as any)?.name : ''}
        rightContent={
          <Link href="/dashboard/email/unibox" className="text-sm font-medium text-warning hover:underline">Back to Unibox</Link>
        }
      />
      {loading && (
        <div className="mt-6 space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-surface-bg" />
          <div className="h-32 animate-pulse rounded-xl bg-surface-bg" />
        </div>
      )}
      {error && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
          <button type="button" className="ml-3 rounded-lg border border-rose-300 px-3 py-1 text-xs font-medium" onClick={() => load()}>Retry</button>
        </div>
      )}
      {!loading && thread && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-surface-border bg-surface-card p-4">
            <p className="text-sm text-ink-2">{(thread.email_campaigns as any)?.name} · {(thread.leads as any)?.email}</p>
            <p className="mt-1 font-medium text-ink-1">{thread.subject || 'No subject'}</p>
          </div>
          <ul className="space-y-4">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`rounded-xl border p-4 ${
                  m.direction === 'out' ? 'border-surface-border bg-surface-card ml-8' : 'border-surface-border bg-surface-bg/50 mr-8'
                }`}
              >
                <p className="text-xs text-ink-2">{m.direction === 'out' ? 'Sent' : 'Received'} · {m.sent_at ? new Date(m.sent_at).toLocaleString() : new Date(m.created_at).toLocaleString()}</p>
                <p className="mt-2 text-ink-1 whitespace-pre-wrap">{m.body_plain || ''}</p>
              </li>
            ))}
          </ul>
          <div className="rounded-xl border border-surface-border bg-surface-card shadow-sm p-6">
            <label className="block text-sm font-medium text-ink-1 mb-2">Reply</label>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Type your reply…"
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-ink-1 min-h-[120px]"
              rows={4}
            />
            <button
              type="button"
              onClick={sendReply}
              disabled={sending || !replyBody.trim()}
              className="mt-3 rounded-lg bg-warning px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
