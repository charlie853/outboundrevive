'use client';

import ProtectedRoute from '@/app/components/ProtectedRoute';
import { useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/api-client';

type Prefs = {
  account_id: string;
  freq_max_per_day: number;
  freq_max_per_week: number;
  min_gap_minutes: number;
  quiet_start: string;
  quiet_end: string;
  timezone: string;
  fl_ok_strict?: boolean;
  updated_at?: string;
};

function PageInner() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const input = { padding: 8, borderRadius: 6, border: '1px solid #ddd' } as React.CSSProperties;
  const btn = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fafafa', cursor: 'pointer' } as React.CSSProperties;
  const btnPrimary = { ...btn, background: '#111', borderColor: '#111', color: '#fff' } as React.CSSProperties;

  async function load() {
    setLoading(true); setError(null);
    try {
      const r = await authenticatedFetch('/api/ui/followups/prefs', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed to load');
      setPrefs(j as Prefs);
    } catch (e: any) {
      setError(e?.message || 'Load failed');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!prefs) return;
    setSaving(true); setToast(null); setError(null);
    try {
      const r = await authenticatedFetch('/api/ui/followups/prefs', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(prefs)
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Save failed');
      setPrefs(j);
      setToast('Saved');
      setTimeout(() => setToast(null), 1500);
      // reflect via dry-run
      await fetch('/api/ui/followups/run', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dry_run: false })
      });
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 700, margin: '24px auto', padding: 16 }}>
      <h1 style={{ marginTop: 0 }}>Follow-up Settings</h1>
      {toast && <div style={{ marginBottom: 12, padding: '8px 10px', background: '#e7f5ef', border: '1px solid #c6e9d8', color: '#0a7', borderRadius: 6 }}>{toast}</div>}
      {error && <div style={{ marginBottom: 12, padding: '8px 10px', background: '#fff6f6', border: '1px solid #f3e0e0', color: '#b00020', borderRadius: 6 }}>{error}</div>}
      {loading && <div>Loading…</div>}
      {prefs && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <label>Max per day</label>
          <input style={input} type="number" value={prefs.freq_max_per_day} onChange={(e) => setPrefs({ ...(prefs as Prefs), freq_max_per_day: parseInt(e.target.value || '0') || 0 })} />

          <label>Max per week</label>
          <input style={input} type="number" value={prefs.freq_max_per_week} onChange={(e) => setPrefs({ ...(prefs as Prefs), freq_max_per_week: parseInt(e.target.value || '0') || 0 })} />

          <label>Min gap (minutes)</label>
          <input style={input} type="number" value={prefs.min_gap_minutes} onChange={(e) => setPrefs({ ...(prefs as Prefs), min_gap_minutes: parseInt(e.target.value || '0') || 0 })} />

          <label>Quiet start</label>
          <input style={input} value={prefs.quiet_start} onChange={(e) => setPrefs({ ...(prefs as Prefs), quiet_start: e.target.value })} placeholder="09:00" />

          <label>Quiet end</label>
          <input style={input} value={prefs.quiet_end} onChange={(e) => setPrefs({ ...(prefs as Prefs), quiet_end: e.target.value })} placeholder="21:00" />

          <label>Timezone</label>
          <input style={input} value={prefs.timezone} onChange={(e) => setPrefs({ ...(prefs as Prefs), timezone: e.target.value })} placeholder="America/New_York" />

          <label>FL/OK Stricter Quiet Hours</label>
          <input type="checkbox" checked={!!prefs.fl_ok_strict} onChange={(e) => setPrefs({ ...(prefs as Prefs), fl_ok_strict: !!e.target.checked })} />

          <div />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving} style={saving ? { ...btnPrimary, opacity: 0.6, cursor: 'not-allowed' } : btnPrimary}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <a href="/leads" style={{ ...btn, textDecoration: 'none' }}>Back</a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FollowupsPage() {
  return (
    <ProtectedRoute>
      <PageInner />
    </ProtectedRoute>
  );
}

