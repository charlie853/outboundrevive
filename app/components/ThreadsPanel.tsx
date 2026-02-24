'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth-context';
import { authenticatedFetch } from '@/lib/api-client';
import ContactPanel from './ContactPanel';

const fetcher = (url: string) =>
  authenticatedFetch(url, { cache: 'no-store' }).then(async (res) => {
    if (!res.ok) {
      const err: any = new Error(`http ${res.status}`);
      err.status = res.status;
      // For threads API, if it's not 401, don't throw - just return empty result
      // The threads API uses service role and shouldn't return 401 anyway
      if (res.status === 401) {
        throw err;
      }
      // For other errors, return ok: true with empty data so UI doesn't break
      return { ok: true, threads: [], error: `http_${res.status}` };
    }
    return res.json();
  }).catch((err) => {
    // Only throw if it's a 401, otherwise return empty result
    if (err?.status === 401) {
      throw err;
    }
    if (process.env.NODE_ENV === 'development') console.debug('[THREADS] fetcher error (non-401):', err);
    return { ok: true, threads: [], error: 'fetch_error' };
  });
const fetcherNoThrow = (url: string) => 
  authenticatedFetch(url, { cache: 'no-store' })
    .then((r) => {
      if (!r.ok && r.status === 401) {
        // Return error object for 401 so we can detect it, but don't throw
        return { error: 'unauthorized', status: 401 };
      }
      return r.json();
    })
    .catch((err) => {
      // Return empty object on other errors - status endpoint is optional
      if (process.env.NODE_ENV === 'development') console.debug('[THREADS] fetcherNoThrow error (non-blocking):', err);
      return {};
    });

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
  last_reply_at?: string | null; // NEW: Last reply timestamp
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
  const { user } = useAuth();
  
  // Get account_id from user metadata (like /api/ui/leads does) or from status endpoint
  const accountIdFromMetadata = (user?.user_metadata as any)?.account_id as string | undefined;
  
  // Always try status endpoint to get account_id (it will use metadata first, then fallback to user_data)
  // Use fetcherNoThrow so status errors don't break the threads call
  const { data: status, error: statusError } = useSWR('/api/ui/account/status', fetcherNoThrow, {
    refreshInterval: 60000,
    shouldRetryOnError: false, // Don't retry status endpoint - it's optional
  });
  const finalAccountId = accountIdFromMetadata || status?.account_id;
  
  // Log status errors but don't let them block threads
  if (statusError && process.env.NODE_ENV === 'development') {
    console.debug('[THREADS] Status endpoint error (non-blocking):', statusError);
  }

  // Make threads API call - it will use default account_id if not provided, but we prefer to pass it
  // Always call threads API, even if account_id isn't available (it will use default)
  const threadsUrl = `/api/threads?limit=20${finalAccountId ? `&account_id=${encodeURIComponent(finalAccountId)}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR<{ ok: boolean; threads?: ThreadRow[] }>(
    threadsUrl,
    fetcher,
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
      shouldRetryOnError: (err) => err?.status !== 401,
    },
  );

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
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      // Use authenticatedFetch for consistency (though endpoint uses service role)
      const response = await authenticatedFetch(endpoint, { cache: 'no-store' });
      
      let json: ConversationPayload & { error?: string };
      try {
        json = await response.json();
      } catch (parseErr) {
        console.warn('[THREADS_PANEL] JSON parse error', parseErr);
        setModalError('Failed to parse conversation data. Please try again.');
        setModalLoading(false);
        return;
      }

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
        setModalError(null);
      } else {
        // More specific error messages
        if (response.status === 401) {
          setModalError(THREADS_BANNER);
        } else if (response.status === 404) {
          setModalError('Conversation not found. This lead may have been deleted.');
        } else if (json?.error) {
          setModalError(`Error: ${json.error}`);
        } else {
          setModalError(`Failed to load conversation (${response.status}). Please try again.`);
        }
        console.warn('[THREADS_PANEL] conversation fetch failed', { status: response.status, json });
      }
    } catch (err: unknown) {
      console.warn('[THREADS_PANEL] conversation fetch exception', err);
      // Check if it's a network error or auth error
      if ((err as any)?.status === 401) {
        setModalError(THREADS_BANNER);
      } else {
        setModalError('Network error. Please check your connection and try again.');
      }
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

  const handleDeleteLead = async (thread: ThreadRow) => {
    const leadId = (thread?.id ?? thread?.lead_id ?? null);
    const phone = thread?.phone ?? thread?.lead_phone ?? '';
    const displayName = thread?.name ?? thread?.lead_name ?? formatPhone(phone);

    if (!leadId) {
      alert('Unable to delete this lead. No lead ID was provided.');
      return;
    }

    if (!window.confirm(`Delete ${displayName}? This will remove the lead and its messages.`)) {
      return;
    }

    setDeletingLeadId(leadId);
    setDeleteError(null);
    try {
      const response = await authenticatedFetch('/api/leads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [leadId] }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.error) {
        throw new Error(json?.error || `Failed to delete lead (${response.status})`);
      }

      // Close modal if this lead's conversation is currently open
      const currentOpenLeadId = conversation?.lead?.id || null;
      if (currentOpenLeadId === leadId) {
        closeModal();
      }

      await mutate();
    } catch (error: any) {
      console.error('[THREADS] Failed to delete lead', error);
      setDeleteError(error?.message || 'Failed to delete lead');
      setTimeout(() => setDeleteError(null), 4000);
    } finally {
      setDeletingLeadId(null);
    }
  };

  // The threads API always returns HTTP 200 (even on errors it returns { ok: true, threads: [] })
  // and uses service role key, so it should never return 401.
  // However, if the fetcher throws a 401 error (e.g., from network/auth middleware), show banner
  const threadsErrorStatus = (error as any)?.status;
  
  // Only show banner if we explicitly got a 401 from the threads API fetch
  // This should be rare since the API uses service role, but keep it for edge cases
  const showBanner = threadsErrorStatus === 401 && !isLoading;

  return (
    <section className="space-y-4">
      <div className="p-6 rounded-[12px] bg-surface-card border border-surface-line shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink-1">Recent Threads</h2>
          </div>
          <button
            type="button"
            onClick={() => mutate()}
            className="inline-flex items-center justify-center rounded-full border-2 border-amber-500 bg-amber-50 text-amber-800 text-sm px-4 py-2 hover:bg-amber-100 transition font-medium"
          >
            Refresh
          </button>
        </div>
        {/* Banner should never show since threads API uses service role and always returns 200 */}
        {showBanner && (
          <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            {THREADS_BANNER}
            <div className="mt-1 text-xs text-amber-600">
              If you see this, there may be an authentication issue. Please refresh the page.
            </div>
          </div>
        )}
      {error && threadsErrorStatus !== 401 && (
        <div className="flex items-center gap-3 text-sm text-rose-700">
          Couldn't load threads.
          <button
            type="button"
            onClick={() => mutate()}
              className="rounded-lg border border-rose-300 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
            >
              Retry
            </button>
          </div>
        )}
        {deleteError && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {deleteError}
          </div>
        )}
        {!error && isLoading && <div className="h-24 animate-pulse rounded-xl bg-surface-bg" />}
        {!error && !isLoading && threads.length === 0 && (
          <div className="text-sm text-ink-2">No recent conversations.</div>
        )}
        {!error && !isLoading && threads.length > 0 && (
          <div className="space-y-3">
            {threads.map((thread, idx) => {
              const phone = thread?.phone ?? thread?.lead_phone ?? '';
              const name = thread?.name ?? thread?.lead_name ?? phone;
              const last = thread?.lastMessage ?? thread?.last_message ?? '';
              const at = thread?.lastAt ?? thread?.last_at ?? thread?.last_activity ?? null;
              const displayName = name || formatPhone(phone);
              const lastTimestamp = at ? new Date(at).toLocaleString() : '—';
              const itemKey = `${phone || 'unknown'}-${at || 'na'}-${idx}`;
              
              // Status fields
              const optedOut = thread?.opted_out ?? false;
              const bookingStatus = thread?.booking_status ?? null;
              const leadType = thread?.lead_type ?? null;
              const owner = thread?.crm_owner ?? null;
              const lastReplyAt = thread?.last_reply_at;

              // Format booking status
              const bookingDisplay = bookingStatus 
                ? (bookingStatus === 'booked' ? 'Booked' : 
                   bookingStatus === 'kept' ? 'Kept' :
                   bookingStatus === 'canceled' ? 'Canceled' :
                   bookingStatus === 'no_show' ? 'No Show' :
                   bookingStatus === 'rescheduled' ? 'Rescheduled' :
                   bookingStatus)
                : null;

              // Format lead type badge
              const leadTypeBadge = leadType === 'new' 
                ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-700 border border-brand-300">New</span>
                : leadType === 'old'
                ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-ink-2/20 text-ink-2 border border-surface-line">Cold</span>
                : null;

              return (
                <div 
                  key={itemKey} 
                  className={`rounded-xl border border-surface-line bg-surface-bg p-4 hover:bg-surface-card transition-shadow ${
                    optedOut ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Lead info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-ink-1 truncate">{displayName}</h3>
                        {leadTypeBadge}
                        {optedOut && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700 border border-rose-300">
                            Opted Out
                          </span>
                        )}
                        {bookingDisplay && (
                          <span className="text-sm text-ink-2">{bookingDisplay}</span>
                        )}
                      </div>
                      <p className="text-sm text-ink-2 mb-2">{formatPhone(phone)}</p>
                      
                      {/* Last message preview */}
                      {last && (
                        <div className="mb-2">
                          <p className="text-sm text-ink-1 line-clamp-2">{last}</p>
                        </div>
                      )}
                      
                      {/* Meta info row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
                        {lastReplyAt && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                            Replied {new Date(lastReplyAt).toLocaleDateString()}
                          </span>
                        )}
                        {owner && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            {owner}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {lastTimestamp}
                        </span>
                      </div>
                    </div>
                    
                    {/* Right: Actions */}
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => openThread(thread)}
                        className="inline-flex items-center justify-center rounded-full bg-amber-600 text-white text-sm px-4 py-2 hover:bg-amber-700 transition font-medium shadow-sm"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLead(thread)}
                        disabled={deletingLeadId === (thread?.id ?? thread?.lead_id ?? null)}
                        className="inline-flex items-center justify-center rounded-full border border-rose-300 text-rose-700 bg-white text-sm px-4 py-2 hover:bg-rose-50 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        title="Delete lead"
                      >
                        {deletingLeadId === (thread?.id ?? thread?.lead_id ?? null) ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
