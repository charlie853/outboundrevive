'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';

const fetcher = (url: string) =>
  fetch(url, { credentials: 'include', cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`threads_${r.status}`);
    return r.json();
  });

type ThreadRow = {
  lead_phone: string | null;
  lead_name: string | null;
  last_message: string;
  last_at: string;
};

type Message = { direction: 'in' | 'out'; body: string; created_at: string };

const WINDOWS = new Set(['24h', '7d', '30d']);

export default function ThreadsPanel() {
  const searchParams = useSearchParams();
  const windowParam = (searchParams?.get('window') ?? '7d').toLowerCase();
  const windowKey = WINDOWS.has(windowParam) ? windowParam : '7d';

  const { data, error, isLoading } = useSWR<{ ok: boolean; threads?: ThreadRow[] }>(
    `/api/threads?limit=50&window=${windowKey}`,
    fetcher,
    { refreshInterval: 15_000 }
  );

  const threads = useMemo(() => (data?.threads ?? []).sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime()), [data]);

  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string>('');
  const [showModal, setShowModal] = useState(false);

  const { data: conversation, error: convoError, isLoading: convoLoading } = useSWR<
    { ok: boolean; messages?: Message[] }
  >(
    activePhone ? `/api/threads/${encodeURIComponent(activePhone)}` : null,
    fetcher,
  );

  const openThread = (thread: ThreadRow) => {
    const phone = thread.lead_phone || '';
    if (!phone) return;
    setActivePhone(phone);
    setActiveName(thread.lead_name || phone);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  useEffect(() => {
    if (!showModal) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        closeModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showModal]);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-surface-line bg-surface-card p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm text-ink-2">Threads</h2>
          <span className="text-xs text-ink-3">Last {windowKey.toUpperCase()}</span>
        </div>
        {error && (
          <div className="text-sm text-amber-700">
            Can’t load threads. If you’re not signed in, please sign in and refresh.
          </div>
        )}
        {!error && isLoading && <div className="h-24 animate-pulse rounded-xl bg-surface-bg" />}
        {!error && !isLoading && threads.length === 0 && (
          <div className="text-sm text-ink-2">No recent messages yet.</div>
        )}
        {!error && !isLoading && threads.length > 0 && (
          <ul className="divide-y divide-surface-line">
            {threads.map((thread) => {
              const title = thread.lead_name || thread.lead_phone || 'Unknown contact';
              return (
                <li key={`${thread.lead_phone}-${thread.last_at}`} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-ink-1">{title}</div>
                    <div className="text-xs text-ink-3">
                      {new Date(thread.last_at).toLocaleString()}
                    </div>
                    <div className="text-sm text-ink-2 line-clamp-2">{thread.last_message}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openThread(thread)}
                    className="rounded-lg border border-surface-line px-3 py-2 text-sm text-ink-1 transition-colors hover:bg-surface-bg"
                  >
                    View
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={closeModal}
          aria-modal="true"
          role="dialog"
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-ink-1">Conversation</h3>
                <p className="text-sm text-ink-3">{activeName}</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-surface-line px-3 py-1.5 text-sm text-ink-1 transition-colors hover:bg-surface-bg"
              >
                Close
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto space-y-3">
              {convoLoading && <div className="h-24 animate-pulse rounded-xl bg-surface-bg" />}
              {convoError && (
                <div className="text-sm text-rose-600">
                  Failed to load conversation. Please try again later.
                </div>
              )}
              {!convoLoading && !convoError && (conversation?.messages ?? []).length === 0 && (
                <div className="text-sm text-ink-2">No messages yet.</div>
              )}
              {!convoLoading && !convoError && (conversation?.messages ?? []).map((msg, idx) => (
                <div key={`${msg.created_at}-${idx}`} className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-soft ${
                      msg.direction === 'out'
                        ? 'bg-brand-600 text-white rounded-br-sm'
                        : 'bg-surface-bg text-ink-1 rounded-bl-sm'
                    }`}
                  >
                    <div className="whitespace-pre-line">{msg.body}</div>
                    <div className="mt-1 text-xs opacity-75">
                      {new Date(msg.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
