'use client';
import { useState } from 'react';

export default function AutotexterToggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(!!defaultOn);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function flip(next: boolean) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/autotexter/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'toggle failed');
      setOn(next);
      if (next) {
        // show immediate feedback about kickoff attempt
        const k = j.kickoff || {};
        const attempted = typeof k.attempted === 'number' ? k.attempted : 0;
        const sent = typeof k.sent === 'number' ? k.sent : 0;
        const dry = k.dryRun ? ' (dry-run)' : '';
        setMsg(`Enabled — queued ${sent}/${attempted} intros${dry}.`);
      } else {
        setMsg('Disabled.');
      }
    } catch (e: any) {
      setMsg(`Error: ${e.message || e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        disabled={busy}
        onClick={() => flip(!on)}
        className={`px-4 py-2 rounded-2xl shadow text-sm font-medium transition
          ${on ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-900'}`}>
        {on ? 'AI Texter: ON' : 'AI Texter: OFF'}
      </button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </div>
  );
}
