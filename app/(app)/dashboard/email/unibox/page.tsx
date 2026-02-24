'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Inbox,
  Tag,
  Megaphone,
  Mail,
  Send,
  Star,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

type Thread = {
  id: string;
  subject: string | null;
  labels: string[];
  last_message_at: string;
  email_campaigns?: { name: string } | null;
  leads?: { name: string; email: string | null } | null;
};

type Message = {
  id: string;
  direction: string;
  body_plain: string | null;
  sent_at: string | null;
  created_at: string;
};

const PAGE_SIZE = 20;

function getInitials(name: string | null | undefined, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
}

function avatarColor(str: string): string {
  const colors = ['bg-brand-500', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-cyan-500'];
  let n = 0;
  for (let i = 0; i < str.length; i++) n += str.charCodeAt(i);
  return colors[n % colors.length];
}

export default function EmailUniboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadId = searchParams?.get('thread') ?? null;

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const [thread, setThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const loadThreads = useCallback(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }
      fetch('/api/email/unibox?limit=100', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
        .then((data) => {
          setThreads(data.threads ?? []);
          setError(null);
        })
        .catch((e) => {
          setError(e?.message || 'Error');
          setThreads([]);
        })
        .finally(() => setLoading(false));
    });
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const loadThreadDetail = useCallback(
    (id: string) => {
      setThreadLoading(true);
      setThreadError(null);
      supabase.auth.getSession().then(({ data: { session } }) => {
        const token = session?.access_token;
        if (!token) {
          setThreadLoading(false);
          return;
        }
        fetch(`/api/email/unibox/threads/${id}`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
          .then((data) => {
            setThread(data.thread);
            setMessages(data.messages ?? []);
          })
          .catch((e) => {
            setThreadError(e?.message || 'Error');
            setThread(null);
            setMessages([]);
          })
          .finally(() => setThreadLoading(false));
      });
    },
    []
  );

  useEffect(() => {
    if (threadId) loadThreadDetail(threadId);
    else {
      setThread(null);
      setMessages([]);
      setThreadError(null);
    }
  }, [threadId, loadThreadDetail]);

  const sendReply = () => {
    if (!threadId || !replyBody.trim()) return;
    setSending(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) {
        setSending(false);
        return;
      }
      fetch(`/api/email/unibox/threads/${threadId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body_plain: replyBody.trim() }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Send failed'))))
        .then(() => {
          setReplyBody('');
          loadThreadDetail(threadId);
          loadThreads();
        })
        .catch((e) => setThreadError(e?.message || 'Send failed'))
        .finally(() => setSending(false));
    });
  };

  const filteredThreads = threads.filter((t) => {
    const name = (t.leads as any)?.name ?? '';
    const email = (t.leads as any)?.email ?? '';
    const subj = t.subject ?? '';
    const camp = (t.email_campaigns as any)?.name ?? '';
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return [name, email, subj, camp].some((s) => String(s).toLowerCase().includes(q));
  });

  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(filteredThreads.length / PAGE_SIZE));
  const pageThreads = filteredThreads.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="mt-6 flex flex-col rounded-xl border border-surface-border bg-surface-card shadow-sm overflow-hidden" style={{ minHeight: 'calc(100vh - 12rem)' }}>
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        <aside className="w-52 flex-shrink-0 border-r border-surface-border flex flex-col bg-surface-bg/50">
          <div className="p-3 border-b border-surface-border">
            <div className="flex items-center gap-2 text-ink-1 font-semibold">
              <Inbox className="w-5 h-5 text-brand-600" />
              Inbox
            </div>
          </div>
          <nav className="p-2 flex flex-col gap-0.5">
            <a className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-ink-2 hover:bg-surface-card hover:text-ink-1" href="#">
              <Tag className="w-4 h-4" /> Labels
            </a>
            <a className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-ink-2 hover:bg-surface-card hover:text-ink-1" href="#">
              <Megaphone className="w-4 h-4" /> Campaigns
            </a>
            <a className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-ink-2 hover:bg-surface-card hover:text-ink-1" href="#">
              <Mail className="w-4 h-4" /> Emails
            </a>
          </nav>
          <div className="mt-auto p-3 border-t border-surface-border">
            <button type="button" className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 text-white text-sm font-medium py-2.5 hover:bg-brand-700 transition">
              <Send className="w-4 h-4" /> Compose Email
            </button>
          </div>
        </aside>

        {/* Center: email list */}
        <div className="w-[420px] flex-shrink-0 border-r border-surface-border flex flex-col bg-white">
          <div className="p-3 border-b border-surface-border space-y-3">
            <h2 className="text-lg font-semibold text-ink-1">Your Replies ({filteredThreads.length})</h2>
            <label className="flex items-center gap-2 text-sm text-ink-2 cursor-pointer">
              <input type="checkbox" checked={showUnreadOnly} onChange={(e) => setShowUnreadOnly(e.target.checked)} className="rounded border-surface-border" />
              Show only unread
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
              <input
                type="text"
                placeholder="Search mail"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-surface-border text-sm text-ink-1 placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-bg" />
                ))}
              </div>
            ) : error ? (
              <div className="p-6 text-sm text-rose-600">
                {error}
                <button type="button" className="ml-2 underline" onClick={() => { setError(null); loadThreads(); }}>Retry</button>
              </div>
            ) : pageThreads.length === 0 ? (
              <div className="p-8 text-center text-sm text-ink-2">No replies yet. Replies from your campaigns will appear here.</div>
            ) : (
              <ul className="divide-y divide-surface-border">
                {pageThreads.map((t) => {
                  const name = (t.leads as any)?.name ?? 'Unknown';
                  const email = (t.leads as any)?.email ?? '';
                  const campaignName = (t.email_campaigns as any)?.name ?? null;
                  const isSelected = threadId === t.id;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => router.replace(`/dashboard/email/unibox?thread=${t.id}`, { scroll: false })}
                        className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-surface-bg/80 transition ${isSelected ? 'bg-brand-50 border-l-2 border-brand-600' : ''}`}
                      >
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold ${avatarColor(email || t.id)}`}>
                          {getInitials(name, email)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-ink-1 truncate">{name}</span>
                            <span className="text-xs text-ink-3 shrink-0">{new Date(t.last_message_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: t.last_message_at > new Date(Date.now() - 86400000 * 365).toISOString() ? 'numeric' : undefined })}</span>
                          </div>
                          <div className="text-xs text-ink-3 truncate">{email}</div>
                          <div className="font-medium text-ink-1 truncate mt-0.5">{t.subject || 'No subject'}</div>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {campaignName && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-sky-800 text-xs font-medium px-2 py-0.5">
                                <Megaphone className="w-3 h-3" /> {campaignName}
                              </span>
                            )}
                            {Array.isArray(t.labels) && t.labels.length > 0 && (
                              <span className="rounded-full bg-amber-100 text-amber-800 text-xs px-2 py-0.5">{t.labels.join(', ')}</span>
                            )}
                          </div>
                        </div>
                        <Star className="w-4 h-4 text-ink-3 flex-shrink-0 mt-1" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {filteredThreads.length > PAGE_SIZE && (
            <div className="px-4 py-2 border-t border-surface-border flex items-center justify-between text-sm text-ink-2">
              <span>{page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filteredThreads.length)} of {filteredThreads.length}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-1 rounded hover:bg-surface-bg disabled:opacity-40">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1 rounded hover:bg-surface-bg disabled:opacity-40">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: read pane */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50/80">
          {!threadId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="relative mb-4">
                <div className="w-24 h-24 rounded-2xl bg-brand-100 flex items-center justify-center rotate-6">
                  <Mail className="w-12 h-12 text-brand-600" />
                </div>
              </div>
              <p className="text-lg font-medium text-ink-1">Select an email to read</p>
              <p className="text-sm text-ink-2 mt-1">Choose a thread from the list to view the conversation and reply.</p>
            </div>
          ) : threadLoading ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="h-24 w-48 animate-pulse rounded-xl bg-surface-bg" />
            </div>
          ) : threadError ? (
            <div className="p-6 text-rose-600 text-sm">
              {threadError}
              <button type="button" className="ml-2 underline" onClick={() => threadId && loadThreadDetail(threadId)}>Retry</button>
            </div>
          ) : thread ? (
            <>
              <div className="border-b border-surface-border bg-white px-6 py-4">
                <p className="text-sm text-ink-2">{(thread.email_campaigns as any)?.name} · {(thread.leads as any)?.email}</p>
                <p className="mt-1 font-semibold text-ink-1">{thread.subject || 'No subject'}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      m.direction === 'out'
                        ? 'ml-auto bg-brand-600 text-white rounded-br-md'
                        : 'bg-white border border-surface-border text-ink-1 rounded-bl-md'
                    }`}
                  >
                    <p className="text-xs opacity-80 mb-1">{m.direction === 'out' ? 'You' : (thread.leads as any)?.name ?? 'Lead'} · {m.sent_at ? new Date(m.sent_at).toLocaleString() : new Date(m.created_at).toLocaleString()}</p>
                    <div className="whitespace-pre-wrap">{m.body_plain || '—'}</div>
                  </div>
                ))}
              </div>
              <div className="border-t border-surface-border bg-white p-6">
                <label className="block text-sm font-medium text-ink-1 mb-2">Reply</label>
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Type your reply…"
                  className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm text-ink-1 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  rows={4}
                />
                <button
                  type="button"
                  onClick={sendReply}
                  disabled={sending || !replyBody.trim()}
                  className="mt-3 rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition"
                >
                  {sending ? 'Sending…' : 'Send reply'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
