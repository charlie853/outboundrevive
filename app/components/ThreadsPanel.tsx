'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import ContactPanel from './ContactPanel';

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store' }).then(async (res) => {
    if (!res.ok) {
      const err: any = new Error(`http ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  });
const fetcherNoThrow = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}));

type ThreadRow = {
  phone?: string | null;
  lead_phone?: string | null;
  name?: string | null;
  lead_name?: string | null;
  lastMessage?: string | null;
  last_message?: string | null;
  lastAt?: string | null;
  last_at?: string | null;
  // NEW: Enrichment fields
  id?: string | null;
  lead_id?: string | null;
  opted_out?: boolean;
  lead_type?: string | null;
  crm_owner?: string | null;
  booking_status?: string | null;
  last_activity?: string | null;
  [key: string]: unknown;
};

type ConversationMessage = { at: string; dir: 'in' | 'out'; body: string; status?: string };

// NEW: Lead enrichment data
type Lead = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  role?: string | null;
  lead_type?: 'new' | 'old' | null;
  crm_source?: string | null;
  crm_url?: string | null;
  status?: string | null;
  opted_out?: boolean;
  last_inbound_at?: string | null;
  last_outbound_at?: string | null;
};

type ConversationPayload = {
  ok?: boolean;
  contact?: { phone: string; name: string };
  messages?: ConversationMessage[];
  items?: ConversationMessage[]; // NEW API format
  lead?: Lead | null; // NEW: Enrichment data
};

const THREADS_BANNER =
  "Threads temporarily unavailable. If you’re not signed in, please sign in and refresh.";

const formatPhone = (phone: string | null | undefined) => {
  if (!phone) return 'Unknown';
  if (phone.startsWith('+1') && phone.length === 12) {
    return `(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`;
  }
  return phone;
};

export default function ThreadsPanel() {
  // Get account_id from status endpoint
  const { data: status } = useSWR('/api/ui/account/status', fetcherNoThrow, {
    refreshInterval: 60000,
  });
  const accountId = status?.account_id;

  const { data, error, isLoading, mutate } = useSWR<{ ok: boolean; threads?: ThreadRow[] }>(
    accountId ? `/api/threads?limit=20&account_id=${encodeURIComponent(accountId)}` : null,
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
      shouldRetryOnError: (err) => err?.status !== 401,
    },
  );

  console.debug('THREADS payload', data);
  console.debug('THREADS accountId:', accountId);
  console.debug('THREADS error:', error);
  console.debug('THREADS isLoading:', isLoading);

  const threads = useMemo(() => {
    const raw = Array.isArray(data?.threads) ? data.threads : [];
    const parseTime = (input: any) => {
      const source = input ?? null;
      if (!source) return 0;
      const ms = Date.parse(source);
      return Number.isFinite(ms) ? ms : 0;
    };
    return [...raw].sort((a: ThreadRow, b: ThreadRow) => {
      const aTime = parseTime(a?.lastAt ?? a?.last_at);
      const bTime = parseTime(b?.lastAt ?? b?.last_at);
      return bTime - aTime;
    });
  }, [data?.threads]);

  const [activeName, setActiveName] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [conversation, setConversation] = useState<ConversationPayload | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  if (error) {
    console.warn('[THREADS_PANEL] error', error);
  }

  useEffect(() => {
    if (!showModal) return;
    const onKey = (evt: KeyboardEvent) => {
      if (evt.key === 'Escape') setShowModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showModal]);

  const openThread = async (thread: ThreadRow) => {
    const phone = thread?.phone ?? thread?.lead_phone ?? '';
    const leadId = thread?.id ?? (thread as any)?.lead_id;
    const friendlyName = thread?.name ?? thread?.lead_name ?? (phone ? formatPhone(phone) : 'Unknown');

    setActiveName(friendlyName);
    setShowModal(true);
    setModalLoading(true);
    setModalError(null);
    setConversation(null);

    // NEW: Prefer lead ID endpoint (includes enrichment) over phone-based endpoint
    const endpoint = leadId 
      ? `/api/ui/leads/${encodeURIComponent(leadId)}/thread`
      : phone
      ? `/api/threads/${encodeURIComponent(phone)}`
      : null;

    if (!endpoint) {
      setModalLoading(false);
      setModalError('No phone number or lead ID available for this thread.');
      return;
    }

    try {
      const response = await fetch(endpoint);
      const json: ConversationPayload & { error?: string } = await response
        .json()
        .catch(() => ({ ok: false }));

      // Handle both old format (messages) and new format (items)
      const messagesList = json?.items ?? json?.messages ?? [];
      
      if (response.ok && Array.isArray(messagesList)) {
        setConversation({
          ...json,
          messages: messagesList,
          items: messagesList,
        });
        if (json.lead?.name) setActiveName(json.lead.name);
        else if (json.contact?.name) setActiveName(json.contact.name);
      } else {
        setModalError(THREADS_BANNER);
      }
    } catch (err: unknown) {
      console.warn('[THREADS_PANEL] conversation fetch failed', err);
      setModalError(THREADS_BANNER);
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setConversation(null);
    setModalError(null);
    setModalLoading(false);
  };

  const isUnauthorized = (error as any)?.status === 401;
  const showBanner = (data?.ok === false && !error) || isUnauthorized;

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-surface-line bg-surface-card p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm text-ink-2">Recent Threads</h2>
          <button
            type="button"
            onClick={() => mutate()}
            className="text-xs text-ink-3 underline-offset-4 hover:underline"
          >
            Refresh
          </button>
        </div>
        {showBanner && (
          <div className="text-sm text-amber-700">
            {THREADS_BANNER}
          </div>
        )}
      {error && !isUnauthorized && (
        <div className="flex items-center gap-3 text-sm text-rose-700">
          Couldn’t load threads.
          <button
            type="button"
            onClick={() => mutate()}
              className="rounded-lg border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
            >
              Retry
            </button>
          </div>
        )}
        {!error && isLoading && <div className="h-24 animate-pulse rounded-xl bg-surface-bg" />}
        {!error && !isLoading && threads.length === 0 && (
          <div className="text-sm text-ink-2">No recent conversations.</div>
        )}
        {!error && !isLoading && threads.length > 0 && (
          <ul className="divide-y divide-surface-line">
            {threads.map((thread, idx) => {
              const phone = thread?.phone ?? thread?.lead_phone ?? '';
              const name = thread?.name ?? thread?.lead_name ?? phone;
              const last = thread?.lastMessage ?? thread?.last_message ?? '';
              const at = thread?.lastAt ?? thread?.last_at ?? thread?.last_activity ?? null;
              const displayName = name || formatPhone(phone);
              const lastTimestamp = at ? new Date(at).toLocaleString() : '—';
              const itemKey = `${phone || 'unknown'}-${at || 'na'}-${idx}`;
              
              // NEW: Status pills
              const optedOut = thread?.opted_out ?? false;
              const bookingStatus = thread?.booking_status ?? null;
              const leadType = thread?.lead_type ?? null;
              const owner = thread?.crm_owner ?? null;

              return (
                <li key={itemKey} className={`flex items-center justify-between gap-4 py-3 ${optedOut ? 'opacity-60' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <div className="text-sm font-medium text-ink-1">{displayName}</div>
                      {/* NEW: Status pills */}
                      {optedOut && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                          Opted Out
                        </span>
                      )}
                      {bookingStatus && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          bookingStatus === 'booked' || bookingStatus === 'kept' 
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : bookingStatus === 'canceled' || bookingStatus === 'no_show'
                            ? 'bg-gray-100 text-gray-800 border border-gray-200'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {bookingStatus === 'booked' ? 'Booked' : 
                           bookingStatus === 'kept' ? 'Kept' :
                           bookingStatus === 'canceled' ? 'Canceled' :
                           bookingStatus === 'no_show' ? 'No Show' :
                           bookingStatus === 'rescheduled' ? 'Rescheduled' :
                           bookingStatus}
                        </span>
                      )}
                      {leadType && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                          {leadType === 'new' ? 'New Lead' : leadType === 'old' ? 'Old Lead' : leadType}
                        </span>
                      )}
                      {owner && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                          {owner}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-3">{lastTimestamp}</div>
                    <div className="text-sm text-ink-2 line-clamp-2">{last || '—'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openThread(thread)}
                    className="rounded-lg border border-surface-line px-3 py-2 text-sm text-ink-1 transition-colors hover:bg-surface-bg flex-shrink-0"
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
          aria-modal="true"
          role="dialog"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
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

            {/* NEW: Two-column layout with ContactPanel + Messages */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Contact Panel - shows enrichment on larger screens */}
              {conversation?.lead && (
                <div className="lg:col-span-1 order-first lg:order-none">
                  <ContactPanel lead={conversation.lead} />
                </div>
              )}
              
              {/* Messages Thread */}
              <div className={conversation?.lead ? "lg:col-span-2" : "lg:col-span-3"}>
                <div className="max-h-96 overflow-y-auto space-y-3 bg-slate-50 rounded-xl p-4">
              {modalLoading && <div className="h-24 animate-pulse rounded-xl bg-surface-bg" />}
              {!modalLoading && modalError && (
                <div className="text-sm text-rose-600">{modalError}</div>
              )}
              {!modalLoading && !modalError && (conversation?.messages ?? []).length === 0 && (
                <div className="text-sm text-ink-2">No messages yet.</div>
              )}
              {!modalLoading && !modalError &&
                (conversation?.messages ?? []).map((msg, idx) => {
                  const timestamp = msg.at ? new Date(msg.at).toLocaleString() : '—';
                  const isOutbound = msg.dir === 'out';
                  const author = isOutbound ? 'You' : conversation?.lead?.name || conversation?.contact?.name || activeName || 'Contact';
                  return (
                    <div key={`${msg.at}-${idx}`} className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-soft ${
                          isOutbound
                            ? 'bg-indigo-600 text-white rounded-br-sm'
                            : 'bg-white text-ink-1 rounded-bl-sm border border-slate-200'
                        }`}
                      >
                        <div className="text-xs font-semibold opacity-80">{author}</div>
                        <div className="whitespace-pre-line">{msg.body || '—'}</div>
                        <div className="mt-1 text-xs opacity-75">{timestamp}</div>
                        {msg.status && <div className="mt-1 text-[11px] uppercase opacity-60">{msg.status}</div>}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
