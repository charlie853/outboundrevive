'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

type Settings = {
  timezone: string;
  quiet_start: string;
  quiet_end: string;
  daily_cap: number;
  brand: string;
  booking_link: string;
  autopilot_enabled: boolean;
  kill_switch: boolean;
  consent_attested: boolean;
};

const row = { display: 'grid', gap: 8, gridTemplateColumns: '160px 1fr', alignItems: 'center' } as const;
const input = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6 } as const;
const btn = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fafafa', cursor: 'pointer' } as const;
const btnPrimary = { ...btn, background: '#111', color: '#fff', borderColor: '#111' } as const;
const hint = { color: '#666', fontSize: 12 } as const;
const card = { border: '1px solid #eee', borderRadius: 8, padding: 16, background: '#fff' } as const;

function SettingsContent() {
  const searchParams = useSearchParams();
  const [s, setS] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const upgrade = searchParams?.get('upgrade');
    if (upgrade === 'success') {
      setMsg('Upgrade successful! Your plan has been updated.');
      // Clear URL param after showing message
      window.history.replaceState({}, '', '/settings');
    } else if (upgrade === 'cancel') {
      setErr('Upgrade was cancelled.');
      window.history.replaceState({}, '', '/settings');
    }
  }, [searchParams]);

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch('/api/ui/settings', { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `Load failed (${r.status})`);
        if (on) setS(j as Settings);
      } catch (e:any) {
        if (on) setErr(e?.message || 'Failed to load settings');
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, []);

  const canSave = useMemo(() => {
    if (!s) return false;
    const hhmm = (v: string) => /^\d{2}:\d{2}$/.test(v);
    return !!s.brand && !!s.timezone && hhmm(s.quiet_start) && hhmm(s.quiet_end) && !saving;
  }, [s, saving]);

  async function save() {
    if (!s) return;
    setSaving(true); setMsg(null); setErr(null);
    try {
      const r = await fetch('/api/ui/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s)
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `Save failed (${r.status})`);
      setS(j);
      setMsg('Saved ✔︎');
    } catch (e:any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 24 }}><h1>Settings</h1><div>Loading…</div></div>;
  }
  if (err && !s) {
    return <div style={{ padding: 24 }}><h1>Settings</h1><div style={{ color: '#b00020' }}>{err}</div></div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Settings</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/leads" style={{ ...btn, textDecoration: 'none' }}>Leads</a>
          <a href="/templates" style={{ ...btn, textDecoration: 'none' }}>Templates</a>
          <a href="/upload" style={{ ...btn, textDecoration: 'none' }}>Upload CSV</a>
        </div>
      </div>

      {!!err && <div style={{ ...card, borderColor: '#f3d1d1', background: '#fff6f6', marginTop: 12 }}>{err}</div>}
      {!!msg && <div style={{ ...card, borderColor: '#d7f3d1', background: '#f6fff6', marginTop: 12 }}>{msg}</div>}

      {s && (
        <div style={{ ...card, marginTop: 16 }}>
          <div style={{ ...row, marginBottom: 10 }}>
            <label>Brand</label>
            <input style={input} value={s.brand} onChange={(e) => setS({ ...s, brand: e.target.value })} />
          </div>

          <div style={{ ...row, marginBottom: 10 }}>
            <label>Booking link</label>
            <input style={input} value={s.booking_link} onChange={(e) => setS({ ...s, booking_link: e.target.value })} placeholder="https://cal.com/you/15min" />
          </div>

          <div style={{ ...row, marginBottom: 10 }}>
            <label>Timezone</label>
            <input style={input} value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} placeholder="America/New_York" />
          </div>

          <div style={{ ...row, marginBottom: 10 }}>
            <label>Quiet hours</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...input, width: 120 }} value={s.quiet_start} onChange={(e) => setS({ ...s, quiet_start: e.target.value })} placeholder="09:00" />
              <span style={{ alignSelf: 'center' }}>to</span>
              <input style={{ ...input, width: 120 }} value={s.quiet_end} onChange={(e) => setS({ ...s, quiet_end: e.target.value })} placeholder="19:00" />
            </div>
          </div>

          <div style={{ ...row, marginBottom: 10 }}>
            <label>Daily cap</label>
            <input
              type="number"
              min={1}
              style={{ ...input, width: 140 }}
              value={s.daily_cap}
              onChange={(e) => setS({ ...s, daily_cap: Math.max(1, Number(e.target.value || 1)) })}
            />
          </div>

          <div style={{ ...row, marginBottom: 6 }}>
            <label>Autopilot</label>
            <div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={s.autopilot_enabled}
                  onChange={(e) => setS({ ...s, autopilot_enabled: e.target.checked })}
                />
                <span>Enable automatic sends</span>
              </label>
              <div style={hint}>When ON, scheduler can send during allowed hours until daily cap.</div>
            </div>
          </div>

          <div style={{ ...row, marginBottom: 6 }}>
            <label>Kill switch</label>
            <div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={s.kill_switch}
                  onChange={(e) => setS({ ...s, kill_switch: e.target.checked })}
                />
                <span>Pause all automated sends</span>
              </label>
              <div style={hint}>Hard stop for scheduler even if Autopilot is enabled.</div>
            </div>
          </div>

          <div style={{ ...row, marginBottom: 16 }}>
            <label>Consent attested</label>
            <div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={s.consent_attested}
                  onChange={(e) => setS({ ...s, consent_attested: e.target.checked })}
                />
                <span>I confirm opt-in consent is on file</span>
              </label>
              <div style={hint}>Required for production SMS. Keep a record of consent.</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={!canSave} style={canSave ? btnPrimary : { ...btn, opacity: 0.6, cursor: 'not-allowed' }}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            <a href="/templates" style={{ ...btn, textDecoration: 'none' }}>Edit templates</a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}><h1>Settings</h1><div>Loading…</div></div>}>
      <SettingsContent />
    </Suspense>
  );
}