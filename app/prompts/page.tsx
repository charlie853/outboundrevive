'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

type PromptVersion = {
  id: string;
  account_id: string;
  content: string;
  version: number;
  created_at: string;
  created_by?: string;
  is_active: boolean;
};

function PromptsContent() {
  const searchParams = useSearchParams();
  const accountId = searchParams?.get('account_id') || process.env.NEXT_PUBLIC_DEFAULT_ACCOUNT_ID || '';
  
  const [current, setCurrent] = useState<string>('');
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [accountId]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/ui/prompts?account_id=${accountId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Load failed');
      setCurrent(j.current || '');
      setVersions(j.versions || []);
    } catch (e: any) {
      setErr(e?.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const r = await fetch('/api/ui/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, content: current }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Save failed');
      setMsg('Saved! New version created.');
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function activate(v: PromptVersion) {
    try {
      const r = await fetch('/api/ui/prompts/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, version_id: v.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Activate failed');
      setMsg('Version activated!');
      await load();
    } catch (e: any) {
      setErr(e?.message || 'Activate failed');
    }
  }

  const card = { border: '1px solid #eee', borderRadius: 8, padding: 16, background: '#fff', marginBottom: 16 };
  const input = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, width: '100%' };
  const btn = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fafafa', cursor: 'pointer', marginRight: 8 };
  const btnPrimary = { ...btn, background: '#111', color: '#fff', borderColor: '#111' };

  if (loading) return <div style={{ padding: 24 }}><h1>Prompt Editor</h1><div>Loading…</div></div>;

  return (
    <div style={{ maxWidth: 1200, margin: '24px auto', padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Prompt Editor</h1>
      {err && <div style={{ ...card, borderColor: '#f3d1d1', background: '#fff6f6' }}>{err}</div>}
      {msg && <div style={{ ...card, borderColor: '#d7f3d1', background: '#f6fff6' }}>{msg}</div>}

      <div style={{ ...card }}>
        <h2 style={{ marginTop: 0 }}>Current Prompt</h2>
        <textarea
          style={{ ...input, minHeight: 300, fontFamily: 'monospace', fontSize: 13 }}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Enter system prompt..."
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button onClick={save} disabled={saving} style={saving ? { ...btn, opacity: 0.6 } : btnPrimary}>
            {saving ? 'Saving…' : 'Save as New Version'}
          </button>
        </div>
      </div>

      <div style={card}>
        <h2>Version History</h2>
        {versions.length === 0 ? (
          <div style={{ color: '#666' }}>No versions yet</div>
        ) : (
          <div>
            {versions.map((v) => (
              <div key={v.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <strong>Version {v.version}</strong>
                    {v.is_active && <span style={{ marginLeft: 8, padding: '2px 8px', background: '#d7f3d1', borderRadius: 4, fontSize: 12 }}>Active</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    {new Date(v.created_at).toLocaleString()}
                    {!v.is_active && (
                      <button onClick={() => activate(v)} style={{ ...btn, marginLeft: 8, fontSize: 12 }}>
                        Activate
                      </button>
                    )}
                  </div>
                </div>
                <pre style={{ background: '#f9f9f9', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto', maxHeight: 200 }}>
                  {v.content.slice(0, 500)}{v.content.length > 500 ? '...' : ''}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PromptsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}><h1>Prompt Editor</h1><div>Loading…</div></div>}>
      <PromptsContent />
    </Suspense>
  );
}

