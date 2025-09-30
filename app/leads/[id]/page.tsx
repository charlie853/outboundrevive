// app/leads/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { authenticatedFetch } from '@/lib/api-client';

type ThreadItem = {
  dir: 'in' | 'out';
  at: string;
  body: string;
  sid: string | null;
  status?: string | null;
  intent?: string | null;
};

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #eee', fontWeight: 600, fontSize: 13 };
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f3f3f3', fontSize: 13 };
const btn: React.CSSProperties = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fafafa', cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { ...btn, background: '#111', color: '#fff', borderColor: '#111' };

function LeadThreadPageContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();

  const leadId = (params?.id as string) || '';
  const [thread, setThread] = useState<ThreadItem[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const [composer, setComposer] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadThread = async () => {
    if (!leadId) return;
    setThreadLoading(true);
    setThreadError(null);
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

  useEffect(() => { loadThread(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leadId]);

  const aiSuggest = async () => {
    if (!leadId) return;
    setSuggesting(true);
    setThreadError(null);
    try {
      let lastInbound: string | undefined;
      if (thread && thread.length) {
        const inbound = [...thread].reverse().find((m) => m.dir === 'in');
        lastInbound = inbound?.body;
      }
      const r = await authenticatedFetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, lastInboundOverride: lastInbound }),
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
    if (!leadId || !composer.trim()) return;
    setSendingReply(true);
    setThreadError(null);
    try {
      const r = await authenticatedFetch(`/api/ui/leads/${leadId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: composer }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Failed to send');
      setComposer('');
      await loadThread();
      setFeedback('Reply sent');
      setTimeout(() => setFeedback(null), 1500);
    } catch (e: any) {
      setThreadError(e?.message || 'Send failed');
    } finally {
      setSendingReply(false);
    }
  };

  const copyTrackedLink = async () => {
    if (!leadId) return;
    const url = `${window.location.origin}/book/${leadId}`;
    try {
      await navigator.clipboard.writeText(url);
      setFeedback('Tracked booking link copied');
      setTimeout(() => setFeedback(null), 2000);
    } catch {
      window.prompt('Copy this URL', url);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      {/* Debug */}
      <div style={{ marginBottom: 16, padding: 8, background: '#f0f0f0', fontSize: 12, borderRadius: 4 }}>
        Auth: {authLoading ? 'Loading…' : user ? `Signed in as ${user.email}` : 'Not signed in'}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Lead Thread</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn} onClick={() => router.push('/leads')}>← Back to Leads</button>
          <button style={btn} onClick={loadThread}>Refresh</button>
        </div>
      </div>

      {feedback && (
        <div style={{ margin: '10px 0', padding: '8px 10px', background: '#eef9f2', border: '1px solid #cbead9', borderRadius: 6, fontSize: 13 }}>
          {feedback}
        </div>
      )}

      {threadLoading && <div style={{ padding: 8 }}>Loading…</div>}
      {threadError && <div style={{ padding: 8, color: '#b00020' }}>{threadError}</div>}
      {!threadLoading && !threadError && (!thread || thread.length === 0) && (
        <div style={{ padding: 8 }}>No messages yet.</div>
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
                <span style={{ fontSize: 12, color: '#666' }}>
                  {new Date(m.at).toLocaleString()}
                </span>
                {m.status && <span style={{ fontSize: 11, color: '#444' }}>· {m.status}</span>}
                {m.intent && <span style={{ fontSize: 11, color: '#444' }}>· {m.intent}</span>}
                {m.sid && <span style={{ fontSize: 11, color: '#999' }}>· {m.sid}</span>}
              </div>
              <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{m.body}</div>
            </li>
          ))}
        </ul>
      )}

      {/* Composer */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
        <label htmlFor="composer" style={{ display: 'block', fontSize: 12, color: '#555', marginBottom: 6 }}>Reply</label>
        <textarea
          id="composer"
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          rows={3}
          placeholder="Type a reply or click AI Suggest…"
          style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 8, resize: 'vertical' }}
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
          <div style={{ fontSize: 12, color: '#666' }}>
            {composer.trim().length}/160
          </div>
        </div>
      </div>

      {/* Booking helpers */}
      <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
        <button style={btn} onClick={copyTrackedLink}>Copy Booking Link</button>
        <a href={`/book/${leadId}`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Open Booking</a>
      </div>
    </div>
  );
}

export default function LeadThreadPage() {
  return (
    <ProtectedRoute>
      <LeadThreadPageContent />
    </ProtectedRoute>
  );
}
