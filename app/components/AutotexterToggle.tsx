'use client';
import { useEffect, useState } from 'react';

export default function AutotexterToggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const r = await fetch('/api/account/settings', { cache: 'no-store' });
        const j = await r.json().catch(() => ({} as any));
        if (!cancelled && j?.ok && typeof j.autotexter_enabled === 'boolean') {
          setOn(j.autotexter_enabled);
        }
      } catch (error: any) {
        if (!cancelled) setMsg(`Error loading state: ${error?.message || error}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  async function flip(next: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/autotexter/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new Error(j.error || 'toggle failed');

      const enabled = typeof j.enabled === 'boolean' ? j.enabled : next;
      setOn(enabled);

      if (enabled) {
        const k = j.kickoff || {};
        const attempted = typeof k?.attempted === 'number' ? k.attempted : 0;
        const sent = typeof k?.sent === 'number' ? k.sent : 0;
        const dry = k?.dryRun ? ' (dry-run)' : '';
        setMsg(`Enabled — queued ${sent}/${attempted} intros${dry}.`);
      } else {
        setMsg('Disabled.');
      }
    } catch (e: any) {
      setMsg(`Error: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || loading;

  return (
    <div className="flex items-center gap-3">
      <button
        disabled={disabled}
        onClick={() => flip(!on)}
        className={`px-4 py-2 rounded-2xl shadow text-sm font-medium transition
          ${on ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-900'}
          ${disabled ? 'opacity-70 cursor-not-allowed' : ''}`}>
        {loading ? 'Loading...' : on ? 'AI Texter: ON' : 'AI Texter: OFF'}
      </button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </div>
  );
}
