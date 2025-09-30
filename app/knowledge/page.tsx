'use client';

import { useState } from 'react';

type SearchRow = { id: string; title?: string | null; url?: string | null; score?: number; excerpt?: string; source?: string };

export default function KnowledgeAdminPage() {
  const [accountId, setAccountId] = useState('');
  const [pagesJson, setPagesJson] = useState('[\n  {"title":"FAQ","text":"Paste content here"}\n]');
  const [limit, setLimit] = useState(50);
  const [q, setQ] = useState('');
  const [k, setK] = useState(5);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ inserted?: number; embedded?: number; used?: string | null } | null>(null);
  const [rows, setRows] = useState<SearchRow[] | null>(null);

  async function ingest() {
    setStatus('Ingesting…'); setError(null); setRows(null);
    try {
      const pages = JSON.parse(pagesJson);
      if (!Array.isArray(pages)) throw new Error('pages must be an array');
      const r = await fetch('/api/ui/knowledge/ingest', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, pages })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'ingest failed');
      setStatus(`Ingested ${j.inserted}/${j.count}`);
      setCounts((c) => ({ ...(c || {}), inserted: j.inserted }));
    } catch (e: any) {
      setError(e?.message || 'ingest failed');
    } finally { setTimeout(() => setStatus(null), 1500); }
  }

  async function embed() {
    setStatus('Embedding…'); setError(null); setRows(null);
    try {
      const r = await fetch('/api/ui/knowledge/embed', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, limit })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'embed failed');
      setStatus(`Embedded ${j.embedded}/${j.inserted_chunks}`);
      setCounts({ inserted: j.inserted_chunks, embedded: j.embedded, used: null });
    } catch (e: any) {
      setError(e?.message || 'embed failed');
    } finally { setTimeout(() => setStatus(null), 1500); }
  }

  async function search() {
    setStatus('Searching…'); setError(null);
    try {
      const u = new URL('/api/ui/knowledge/search', window.location.origin);
      u.searchParams.set('account_id', accountId);
      u.searchParams.set('q', q);
      u.searchParams.set('k', String(k));
      u.searchParams.set('debug', '1');
      const r = await fetch(u.toString(), { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'search failed');
      setRows(j.rows || []);
      setCounts((c) => ({ ...(c || {}), used: j.used || null }));
      setStatus(`Search returned ${j.rows?.length || 0}`);
    } catch (e: any) {
      setError(e?.message || 'search failed');
    } finally { setTimeout(() => setStatus(null), 1500); }
  }

  const input = { padding: 8, borderRadius: 6, border: '1px solid #ddd' } as React.CSSProperties;
  const btn = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fafafa', cursor: 'pointer' } as React.CSSProperties;
  const btnPrimary = { ...btn, background: '#111', borderColor: '#111', color: '#fff' } as React.CSSProperties;

  return (
    <div style={{ maxWidth: 900, margin: '24px auto', padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Knowledge Admin</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
        <label>Account ID</label>
        <input style={input} value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="1111-..." />

        <label>Pages (JSON)</label>
        <textarea style={{ ...input, height: 120 }} value={pagesJson} onChange={(e) => setPagesJson(e.target.value)} />

        <label>Embed Limit</label>
        <input style={input} type="number" value={limit} onChange={(e) => setLimit(parseInt(e.target.value || '0') || 0)} />

        <label>Search Query</label>
        <input style={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." />

        <label>Top K</label>
        <input style={input} type="number" value={k} onChange={(e) => setK(parseInt(e.target.value || '1') || 1)} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={ingest} style={btn}>Ingest</button>
        <button onClick={embed} style={btn}>Embed</button>
        <button onClick={search} style={btnPrimary}>Search tester</button>
      </div>

      {(status || error) && (
        <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 6, border: '1px solid #eee', background: '#fafafa' }}>
          {status && <span style={{ marginRight: 12 }}>{status}</span>}
          {error && <span style={{ color: '#b00020' }}>{error}</span>}
        </div>
      )}

      {counts && (
        <div style={{ marginBottom: 12, fontSize: 13, color: '#333' }}>
          Inserted: <b>{counts.inserted ?? '—'}</b> · Embedded: <b>{counts.embedded ?? '—'}</b> · Used: <b>{counts.used ?? '—'}</b>
        </div>
      )}

      {rows && (
        <div>
          <h3 style={{ margin: '8px 0' }}>Results</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rows.map((r, i) => (
              <li key={i} style={{ padding: '10px 8px', border: '1px solid #eee', borderRadius: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontWeight: 600 }}>{r.title || r.id}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{r.source || '—'}{typeof r.score === 'number' ? ` · ${r.score.toFixed(3)}` : ''}</div>
                </div>
                {r.url && <div style={{ fontSize: 12, color: '#444' }}>{r.url}</div>}
                <div style={{ marginTop: 6, fontSize: 13, color: '#222' }}>{r.excerpt || '—'}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

