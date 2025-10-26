'use client';

import dynamic from 'next/dynamic';
const CRMIntegrations = dynamic(() => import("../components/CRMIntegrations"), { ssr: false });
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from "@/lib/auth-context";
import ProtectedRoute from "../components/ProtectedRoute";
import { authenticatedFetch } from "@/lib/api-client";



type Lead = {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  created_at: string;
  replied?: boolean | null;
  intent?: string | null;
  opted_out?: boolean | null;
  delivery_status?: string | null;
  error_code?: number | null;
  last_message_sid?: string | null;
  appointment_set_at?: string | null;
};

type ThreadItem = {
  dir: 'in' | 'out';
  at: string;
  body: string;
  sid: string | null;
  status?: string | null;
  intent?: string | null;
};

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e5e5', fontWeight: 600, fontSize: 13, color: '#374151' };
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #e5e5e5', fontSize: 13, color: '#111827' };
const btn: React.CSSProperties = { padding: '8px 12px', borderWidth: 1, borderStyle: 'solid', borderColor: '#d1d5db', borderRadius: 8, background: '#f9fafb', color: '#374151', cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { ...btn, background: '#4f46e5', color: '#ffffff', borderColor: '#4f46e5' };
const hint: React.CSSProperties = { color: '#6b7280', fontSize: 12 };

const badgeBooked: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 999,
  background: 'rgba(34,197,94,0.15)',
  border: '1px solid rgba(34,197,94,0.35)',
  color: '#22c55e',
  fontSize: 11,
  fontWeight: 600,
};

function LeadsPageContent() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(
    'Hi {{name}}—{{brand}} here re your earlier inquiry. Reply YES to book.'
  );
  const [brand, setBrand] = useState('OutboundRevive');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<string | null>(null);

  // Thread modal state
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadItem[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await authenticatedFetch('/api/leads?limit=200', {
        cache: 'no-store'
      });
      if (!res.ok) throw new Error(`Failed to load leads: ${res.status}`);
      const json = await res.json();
      setData(json.data || []);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to load leads');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    (async () => {
      try {
        const r = await authenticatedFetch('/api/ui/onboarding/state', { cache: 'no-store' });
        const j = await r.json();
        if (r.ok && j?.step && j.step !== 'done') setOnboardingStep(j.step);
      } catch { }
    })();
  }, []);

  // Listen for booking success from /book page (cross-tab via localStorage)
  useEffect(() => {
    function onStorage(ev: StorageEvent) {
      if (ev.key !== 'leadBooked' || !ev.newValue) return;
      try {
        const { id, at } = JSON.parse(ev.newValue);
        setData((rows) => rows.map((r) => (r.id === id ? { ...r, appointment_set_at: at } : r)));
      } catch { }
      // also refresh quietly after a short delay to confirm
      setTimeout(() => load(), 800);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const allSelected = useMemo(
    () => data.length > 0 && data.every((l) => !!selected[l.id]),
    [data, selected]
  );
  const selectedIds = useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected]
  );

  const toggle = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const toggleAll = () => {
    if (allSelected) setSelected({});
    else {
      const next: Record<string, boolean> = {};
      for (const l of data) next[l.id] = true;
      setSelected(next);
    }
  };

  const previewName = useMemo(() => {
    const first = data.find((l) => selected[l.id]);
    return first?.name || 'there';
  }, [data, selected]);

  const renderedPreview = useMemo(() => {
    return msg.replaceAll('{{name}}', previewName).replaceAll('{{brand}}', brand || '');
  }, [msg, previewName, brand]);

  const tooLong = renderedPreview.trim().length > 160;
  const canSend = selectedIds.length > 0 && !tooLong && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true); setFeedback(null);
    try {
      const r = await authenticatedFetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: selectedIds, message: msg, brand }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'Failed to send');
      setFeedback(`Sent ${json.results.filter((x: any) => x.sid).length}/${selectedIds.length}`);
      await load();
      setSelected({});
    } catch (e: any) {
      setFeedback(`Error: ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  // Thread actions
  const openThread = async (leadId: string) => {
    setOpenLeadId(leadId);
    setComposer('');
    setThread(null);
    setThreadError(null);
    setThreadLoading(true);
    try {
      const r = await authenticatedFetch(`/api/ui/leads/${leadId}/thread`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `Failed to load thread (${r.status})`);
      setThread((j.items as ThreadItem[]) || []);
    } catch (e: any) {
      setThreadError(e?.message || 'Failed to load thread');
    } finally {
      setThreadLoading(false);
    }
  };
  const closeThread = () => {
    setOpenLeadId(null);
    setThread(null);
    setThreadError(null);
  };

  const refreshThread = async () => {
    if (!openLeadId) return;
    setThreadLoading(true);
    setThreadError(null);
    try {
      const r = await authenticatedFetch(`/api/ui/leads/${openLeadId}/thread`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `Failed to load thread (${r.status})`);
      setThread((j.items as ThreadItem[]) || []);
    } catch (e: any) {
      setThreadError(e?.message || 'Failed to load thread');
    } finally {
      setThreadLoading(false);
    }
  };

  const aiSuggest = async () => {
    if (!openLeadId) return;
    setSuggesting(true);
    setThreadError(null);
    try {
      // Try to pass the last inbound as hint
      let lastInbound: string | undefined;
      if (thread && thread.length) {
        const inbound = [...thread].reverse().find((m) => m.dir === 'in');
        lastInbound = inbound?.body;
      }
      const r = await authenticatedFetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: openLeadId, lastInboundOverride: lastInbound }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed to get AI draft');
      if (j?.draft) setComposer(j.draft);
      else setThreadError('No draft generated');
    } catch (e: any) {
      setThreadError(e?.message || 'AI suggest failed');
    } finally {
      setSuggesting(false);
    }
  };

  const sendManual = async () => {
    if (!openLeadId || !composer.trim()) return;
    setSendingReply(true);
    setThreadError(null);
    try {
      const r = await authenticatedFetch(`/api/ui/leads/${openLeadId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: composer }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Failed to send');
      setComposer('');
      await refreshThread();
      setFeedback('Reply sent');
      setTimeout(() => setFeedback(null), 1500);
    } catch (e: any) {
      setThreadError(e?.message || 'Send failed');
    } finally {
      setSendingReply(false);
    }
  };

  const openLead = useMemo(
    () => data.find((l) => l.id === openLeadId) || null,
    [data, openLeadId]
  );

  const copyTrackedLink = async () => {
    if (!openLeadId) return;
    const url = `${window.location.origin}/book/${openLeadId}`;
    try {
      await navigator.clipboard.writeText(url);
      setFeedback('Tracked booking link copied');
      setTimeout(() => setFeedback(null), 2000);
    } catch {
      window.prompt('Copy this URL', url);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {onboardingStep && (
        <div style={{ marginBottom: 12, padding: 10, border: '1px solid #ffe7c2', background: '#fff8ec', borderRadius: 8 }}>
          Finish onboarding (step: {onboardingStep}) → <a href="/onboarding">Open wizard</a>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#111827' }}>Leads</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={btn}>Refresh</button>
          <a href="/upload" style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Upload CSV</a>
          <a href="/templates" style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Templates</a>
          <a href="/settings" style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Settings</a>
        </div>
      </div>

      <CRMIntegrations
        userId={user?.id || "unknown-user"}
        userEmail={user?.email || "unknown@example.com"}
        organizationId="demo-org"
        onConnect={(connectionId, provider) => {
          setFeedback(`Connected to ${provider} (ID: ${connectionId})`);
          setTimeout(() => setFeedback(null), 3000);
        }}
        onSync={(results) => {
          setFeedback(`Synced ${results.processed} contacts: ${results.created} new, ${results.updated} updated`);
          setTimeout(() => setFeedback(null), 5000);
          load(); // Refresh the leads table
        }}
        onError={(error) => {
          setFeedback(`CRM error: ${error}`);
          setTimeout(() => setFeedback(null), 5000);
        }}
      />

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <input style={{ width: 240, padding: 8, border: '1px solid #d1d5db', borderRadius: 6, color: '#111827' }} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand" />
        <input style={{ flex: 1, padding: 8, border: '1px solid #d1d5db', borderRadius: 6, color: '#111827' }} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder='Message (<=160 characters)' />
        <button onClick={send} disabled={!canSend} style={canSend ? btnPrimary : { ...btn, opacity: 0.6, cursor: 'not-allowed' }}>
          {sending ? 'Sending…' : `Send to selected (${selectedIds.length})`}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <span style={hint}>Preview: “{renderedPreview}”</span>
        <span style={hint}>Chars: {renderedPreview.trim().length}/160</span>
        {tooLong && <span style={{ ...hint, color: '#dc2626' }}>Too long (max 160)</span>}
        {feedback && <span style={{ ...hint, color: '#059669' }}>{feedback}</span>}
      </div>

      {error && <div style={{ margin: '8px 0', padding: '8px 10px', background: '#fff6f6', border: '1px solid #f3e0e0', borderRadius: 6 }}>{error}</div>}

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={th}><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} /></th>
            <th style={th}>Name</th>
            <th style={th}>Phone</th>
            <th style={th}>Status</th>
            <th style={th}>Replied</th>
            <th style={th}>Intent</th>
            <th style={th}>Booked</th>{/* ⬅️ NEW */}
            <th style={th}>Created</th>
            <th style={th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ ...td, textAlign: 'center' }}>Loading…</td></tr>
          ) : data.length === 0 ? (
            <tr><td colSpan={9} style={{ ...td, textAlign: 'center' }}>No leads yet. <a href="/upload">Upload CSV</a> or Connect CRM.</td></tr>
          ) : data.map((l) => {
            const isBooked = !!l.appointment_set_at;
            return (
              <tr key={l.id} style={l.opted_out ? { opacity: 0.55 } : undefined}>
                <td style={td}><input type="checkbox" checked={!!selected[l.id]} onChange={() => toggle(l.id)} /></td>
                <td style={td}>{l.name || '—'}</td>
                <td style={td}>{l.phone} {l.opted_out && <span style={{ marginLeft: 8, fontSize: 11, color: '#dc2626' }}>OPTED OUT</span>}</td>
                <td style={td}>{l.status}</td>
                <td style={td}>{l.replied ? '✅' : '—'}</td>
                <td style={td}>{l.intent || '—'}</td>
                <td style={td}>
                  {isBooked ? <span style={badgeBooked}>BOOKED</span> : '—'}
                </td>
                <td style={td}>{new Date(l.created_at).toLocaleString()}</td>
                <td style={td}>
                  <button style={btn} onClick={() => openThread(l.id)} disabled={threadLoading}>
                    {threadLoading && openLeadId === l.id ? 'Loading…' : 'Thread'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Thread modal */}
      {openLeadId && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000
          }}
          onClick={closeThread}
        >
          <div
            style={{ background: '#fff', borderRadius: 10, width: 700, maxWidth: '95%', maxHeight: '80vh', overflow: 'auto', padding: 16 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 18, color: '#111827' }}>Thread</h3>
              <button style={btn} onClick={closeThread}>Close</button>
            </div>

            {/* Booking panel */}
            {openLead && (
              <div style={{ marginBottom: 12, padding: 10, border: '1px solid #eee', borderRadius: 8, background: '#fafafa' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#111827', marginBottom: 4 }}>
                      Booking link: <code>/book/{openLead.id}</code>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      {openLead.appointment_set_at
                        ? <>Booked at <b>{new Date(openLead.appointment_set_at).toLocaleString()}</b></>
                        : <>Not booked yet</>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btn} onClick={copyTrackedLink}>Copy link</button>
                    <a href={`/book/${openLead.id}`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>Open</a>
                  </div>
                </div>
              </div>
            )}

            {threadLoading && <div style={{ padding: 8, color: '#111827' }}>Loading…</div>}
            {threadError && <div style={{ padding: 8, color: '#dc2626' }}>{threadError}</div>}
            {!threadLoading && !threadError && (!thread || thread.length === 0) && (
              <div style={{ padding: 8, color: '#111827' }}>No messages yet.</div>
            )}

            {!threadLoading && !threadError && thread && thread.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {thread.map((m, i) => (
                  <li key={i} style={{ padding: '10px 8px', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 999,
                          background: m.dir === 'out' ? '#eef' : '#efe',
                          border: '1px solid #ddd'
                        }}
                      >
                        {m.dir === 'out' ? 'OUT' : 'IN'}
                      </span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        {new Date(m.at).toLocaleString()}
                      </span>
                      {m.status && <span style={{ fontSize: 11, color: '#374151' }}>· {m.status}</span>}
                      {m.intent && <span style={{ fontSize: 11, color: '#374151' }}>· {m.intent}</span>}
                      {m.sid && <span style={{ fontSize: 11, color: '#9ca3af' }}>· {m.sid}</span>}
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', color: '#111827' }}>{m.body}</div>
                  </li>
                ))}
              </ul>
            )}

            {/* Composer */}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
              <label htmlFor="composer" style={{ display: 'block', fontSize: 12, color: '#374151', marginBottom: 6 }}>Reply</label>
              <textarea
                id="composer"
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                rows={3}
                placeholder="Type a reply or click AI Suggest…"
                style={{ width: '100%', padding: 10, border: '1px solid #d1d5db', borderRadius: 8, resize: 'vertical', color: '#111827' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={aiSuggest} disabled={suggesting} style={suggesting ? { ...btn, opacity: 0.6, cursor: 'not-allowed' } : btn}>
                    {suggesting ? 'Thinking…' : 'AI Suggest'}
                  </button>
                  <button onClick={sendManual} disabled={!composer.trim() || sendingReply} style={!composer.trim() || sendingReply ? { ...btnPrimary, opacity: 0.6, cursor: 'not-allowed' } : btnPrimary}>
                    {sendingReply ? 'Sending…' : 'Send'}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {composer.trim().length}/160
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import AppShell from '@/app/components/AppShell';

export default function LeadsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <LeadsPageContent />
      </AppShell>
    </ProtectedRoute>
  );
}
