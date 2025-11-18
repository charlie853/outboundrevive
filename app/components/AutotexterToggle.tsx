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
    <div className="relative">
      <button
        disabled={disabled}
        onClick={() => flip(!on)}
        className={`inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium transition-all border ${
          on 
            ? 'text-ink-1 shadow-sm' 
            : 'bg-white border-surface-line text-ink-2 hover:bg-surface-bg'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        style={on ? {
          background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
          borderColor: '#F59E0B',
          borderWidth: '1px',
          borderStyle: 'solid'
        } : {}}
        onMouseEnter={(e) => {
          if (on && !disabled) {
            e.currentTarget.style.background = 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)';
            e.currentTarget.style.filter = 'brightness(1.1)';
          }
        }}
        onMouseLeave={(e) => {
          if (on && !disabled) {
            e.currentTarget.style.background = 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)';
            e.currentTarget.style.filter = 'none';
          }
        }}
      >
        {loading ? 'Loading...' : on ? 'AI Texter: ON' : 'AI Texter: OFF'}
      </button>
      {msg && (
        <div className="absolute top-full mt-2 right-0 text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap bg-indigo-50 text-indigo-700 border border-indigo-200 z-10">
          {msg}
        </div>
      )}
    </div>
  );
}
