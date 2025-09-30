"use client";
import { useEffect, useState } from 'react';

export default function PauseToggle() {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      try { const r = await fetch('/api/ui/account/status', { cache: 'no-store' }); const j = await r.json(); setPaused(!!j.outbound_paused); } catch {}
    })();
  }, []);

  async function toggle() {
    if (paused === null) return;
    setBusy(true);
    try {
      const r = await fetch('/api/ui/account/status', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outbound_paused: !paused }) });
      const j = await r.json();
      setPaused(!!j.outbound_paused);
    } finally { setBusy(false); }
  }

  return (
    <div className={`rounded-2xl border bg-white p-5 ${paused ? 'border-red-300 bg-red-50' : ''}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Emergency Stop</div>
          <div className="text-sm text-zinc-500">{paused ? 'Outbound paused — no texts will be sent.' : 'Outbound active — texts may be sent based on your settings.'}</div>
        </div>
        <button onClick={toggle} disabled={paused === null || busy} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 border ${paused ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' : 'bg-white text-zinc-900 hover:bg-zinc-50'}`}>
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </div>
  );
}

