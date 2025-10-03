"use client";
import { useEffect, useState } from 'react';

type Item = { id: string; dir: 'in'|'out'; at: string; body: string; lead_id?: string; status?: string|null };

export default function RecentActivity({ hours }: { hours: number }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const r = await fetch(`/api/ui/activity/recent?hours=${hours}&dir=all`, { cache: 'no-store' });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'Failed');
        if (on) setItems((j.items || []).slice(0, 10));
      } catch (e: any) { if (on) setErr(e?.message || 'Failed'); }
    })();
    return () => { on = false; };
  }, [hours]);
  return (
    <div className="rounded-2xl border border-surface-line bg-surface-card p-4 shadow-soft">
      <div className="mb-2 text-sm text-ink-2">Recent activity</div>
      {!items && !err && <div className="h-32 animate-pulse rounded-xl bg-surface-bg" />}
      {err && <div className="text-rose-600 text-sm">{err}</div>}
      {items && items.length === 0 && <div className="text-ink-2 text-sm">No recent messages.</div>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-surface-line">
          {items.map((it) => (
            <li key={it.id} className="py-2 flex items-start gap-3">
              <span className={`mt-1 inline-block h-2 w-2 rounded-full ${it.dir === 'in' ? 'bg-emerald-500' : 'bg-brand-600'}`} />
              <div className="flex-1">
                <div className="text-xs text-ink-2">{new Date(it.at).toLocaleString()}</div>
                <div className="text-ink-1 text-sm">{it.body}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

