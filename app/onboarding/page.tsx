'use client';
import { useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/api-client';

type State = {
  account_id: string;
  step: 'welcome'|'profile'|'hours'|'number'|'kb'|'imports'|'done';
  business_name?: string|null;
  website?: string|null;
  timezone?: string|null;
  twilio_connected?: boolean;
  kb_ingested?: boolean;
  crm_connected?: boolean;
};

export default function OnboardingPage() {
  const [s, setS] = useState<State|null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);
  const [profile, setProfile] = useState({ business_name:'', website:'', timezone:'America/New_York' });

  async function load() {
    setLoading(true); setErr(null);
    const r = await authenticatedFetch('/api/ui/onboarding/state', { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) { setErr(j?.error||'Failed to load'); setLoading(false); return; }
    setS(j); setProfile({ business_name: j.business_name||'', website:j.website||'', timezone: j.timezone||'America/New_York' });
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function saveProfile() {
    const r = await authenticatedFetch('/api/ui/onboarding/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...profile, step: 'hours' }) });
    const j = await r.json(); if (!r.ok) { setErr(j?.error||'Save failed'); } else { setS(j); }
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (err) return <div style={{ padding: 24, color: '#b00020' }}>{err}</div>;
  if (!s) return null;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1>Onboarding</h1>
      <div style={{ marginBottom: 16, color: '#555' }}>Step: {s.step}</div>

      {s.step === 'welcome' || s.step === 'profile' ? (
        <section style={{ border: '1px solid #eee', borderRadius: 10, padding: 16 }}>
          <h3>Business profile</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <label>Name</label>
            <input value={profile.business_name} onChange={(e) => setProfile(p => ({ ...p, business_name: e.target.value }))} />
            <label>Website</label>
            <input value={profile.website} onChange={(e) => setProfile(p => ({ ...p, website: e.target.value }))} />
            <label>Timezone</label>
            <input value={profile.timezone} onChange={(e) => setProfile(p => ({ ...p, timezone: e.target.value }))} />
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={saveProfile} style={{ padding: '8px 12px', background: '#111', color: '#fff', borderRadius: 8 }}>Save & Continue</button>
          </div>
        </section>
      ) : null}

      {s.step === 'hours' ? (
        <section style={{ border: '1px solid #eee', borderRadius: 10, padding: 16 }}>
          <h3>Hours & caps</h3>
          <p>Edit follow-up prefs in Settings → Follow-ups.</p>
          <a href="/followups" style={{ padding: '8px 12px', border: '1px solid #111', borderRadius: 8, textDecoration: 'none' }}>Open Follow-ups</a>
        </section>
      ) : null}

      {s.step === 'number' ? (
        <section style={{ border: '1px solid #eee', borderRadius: 10, padding: 16 }}>
          <h3>Messaging number</h3>
          <p>Connect Twilio in a future step. For now, dry-run is enabled.</p>
        </section>
      ) : null}

      {s.step === 'kb' ? (
        <section style={{ border: '1px solid #eee', borderRadius: 10, padding: 16 }}>
          <h3>Knowledge</h3>
          <p>Go to Docs → Knowledge to ingest and embed.</p>
          <a href="/knowledge" style={{ padding: '8px 12px', border: '1px solid #111', borderRadius: 8, textDecoration: 'none' }}>Open Knowledge</a>
        </section>
      ) : null}

      {s.step === 'imports' ? (
        <section style={{ border: '1px solid #eee', borderRadius: 10, padding: 16 }}>
          <h3>Import leads</h3>
          <a href="/upload" style={{ padding: '8px 12px', border: '1px solid #111', borderRadius: 8, textDecoration: 'none' }}>Upload CSV</a>
        </section>
      ) : null}
    </div>
  );
}

