'use client';

import { useEffect, useMemo, useState } from 'react';

type Lead = {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  created_at: string;
  replied?: boolean | null;
  intent?: string | null;
  opted_out?: boolean | null;
};

const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #eee', fontWeight: 600, fontSize: 13 };
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f3f3f3', fontSize: 13 };
const btn: React.CSSProperties = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fafafa', cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { ...btn, background: '#111', color: '#fff', borderColor: '#111' };
const hint: React.CSSProperties = { color: '#666', fontSize: 12 };

export default function LeadsPage() {
  const [data, setData] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(
    'Hi {{name}}—{{brand}} here re your earlier inquiry. Reply YES to book. Txt STOP to opt out'
  );
  const [brand, setBrand] = useState('OutboundRevive');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/leads?limit=200', { cache: 'no-store' });
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
  const hasStop = /txt stop to opt out/i.test(renderedPreview);
  const canSend = selectedIds.length > 0 && !tooLong && hasStop && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true); setFeedback(null);
    try {
      const r = await fetch('/api/sms/send', {
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

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Leads</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={btn}>Refresh</button>
          <a href="/upload" style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Upload CSV</a>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <input style={{ width: 240, padding: 8 }} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Brand" />
        <input style={{ flex: 1, padding: 8 }} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder='Message (<=160, must include "Txt STOP to opt out")' />
        <button onClick={send} disabled={!canSend} style={canSend ? btnPrimary : { ...btn, opacity: 0.6, cursor: 'not-allowed' }}>
          {sending ? 'Sending…' : `Send to selected (${selectedIds.length})`}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <span style={hint}>Preview: “{renderedPreview}”</span>
        <span style={hint}>Chars: {renderedPreview.trim().length}/160</span>
        {!hasStop && <span style={{ ...hint, color: '#b00020' }}>Must include: “Txt STOP to opt out”</span>}
        {tooLong && <span style={{ ...hint, color: '#b00020' }}>Too long (max 160)</span>}
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
            <th style={th}>Created</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={7} style={{ ...td, textAlign: 'center' }}>No leads yet. <a href="/upload">Upload CSV</a></td></tr>
          ) : data.map((l) => (
            <tr key={l.id} style={l.opted_out ? { opacity: 0.55 } : undefined}>
              <td style={td}><input type="checkbox" checked={!!selected[l.id]} onChange={() => toggle(l.id)} /></td>
              <td style={td}>{l.name || '—'}</td>
              <td style={td}>{l.phone}</td>
              <td style={td}>{l.status}</td>
              <td style={td}>{l.replied ? '✅' : '—'}</td>
              <td style={td}>{l.intent || '—'}</td>
              <td style={td}>{new Date(l.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}