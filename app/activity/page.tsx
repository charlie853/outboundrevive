'use client';

import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/api-client';

type Item = {
  dir: 'in' | 'out';
  at: string;
  body: string;
  sid?: string | null;
  status?: string | null;
  intent?: string | null;
  from?: string | null;
  to?: string | null;
};

function ActivityInner() {
  const [hours, setHours] = useState(24);
  const [dir, setDir] = useState<'all' | 'in' | 'out'>('all');
  const [status, setStatus] = useState('');
  const [intent, setIntent] = useState('');
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = { padding: 8, borderRadius: 6, border: '1px solid #ddd' } as React.CSSProperties;
  const btn = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fafafa', cursor: 'pointer' } as React.CSSProperties;

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const u = new URL('/api/ui/activity/recent', window.location.origin);
      u.searchParams.set('hours', String(hours));
      if (dir !== 'all') u.searchParams.set('dir', dir);
      if (status.trim()) u.searchParams.set('status', status.trim());
      if (intent.trim()) u.searchParams.set('intent', intent.trim());
      const r = await authenticatedFetch(u.toString(), { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed to load');
      setItems(j.items || []);
    } catch (e: any) {
      setError(e?.message || 'Load failed');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const rendered = useMemo(() => items || [], [items]);

  return (
    <div style={{ maxWidth: 1000, margin: '24px auto', padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Activity</h1>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <label>Last</label>
        <input style={input} type="number" value={hours} onChange={(e) => setHours(parseInt(e.target.value || '1') || 1)} />
        <span>hours</span>
        <select style={input} value={dir} onChange={(e) => setDir(e.target.value as any)}>
          <option value="all">All</option>
          <option value="in">Inbound</option>
          <option value="out">Outbound</option>
        </select>
        <input style={input} value={status} onChange={(e) => setStatus(e.target.value)} placeholder="status filter (outbound)" />
        <input style={input} value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="intent filter (outbound)" />
        <button style={btn} onClick={load}>Refresh</button>
      </div>

      {loading && <div>Loading…</div>}
      {error && <div style={{ color: '#b00020' }}>{error}</div>}

      {!loading && !error && rendered.length === 0 && <div>No activity.</div>}

      {!loading && !error && rendered.length > 0 && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #eee' }}>Dir</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #eee' }}>When</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #eee' }}>Body</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #eee' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #eee' }}>Intent</th>
              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #eee' }}>SID</th>
            </tr>
          </thead>
          <tbody>
            {rendered.map((r, i) => (
              <tr key={i}>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f3f3' }}>{r.dir.toUpperCase()}</td>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f3f3' }}>{new Date(r.at).toLocaleString()}</td>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f3f3' }}>{r.body}</td>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f3f3' }}>{r.status || '—'}</td>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f3f3' }}>{r.intent || '—'}</td>
                <td style={{ padding: '8px 10px', borderBottom: '1px solid #f3f3f3' }}>{r.sid || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function ActivityPage() {
  return (
    <ProtectedRoute>
      <ActivityInner />
    </ProtectedRoute>
  );
}

