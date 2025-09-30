import PauseToggle from './PauseToggle';
import AppShell from '@/app/components/AppShell';

async function getJSON(path: string) {
  const r = await fetch(path, { cache: 'no-store' });
  try { return await r.json(); } catch { return null; }
}

export default async function DashboardPage() {
  const [status, metrics, activity] = await Promise.all([
    getJSON(`${process.env.PUBLIC_BASE_URL}/api/ui/account/status`).catch(()=>({})),
    getJSON(`${process.env.PUBLIC_BASE_URL}/api/metrics/last7d`).catch(()=>({})),
    getJSON(`${process.env.PUBLIC_BASE_URL}/api/ui/activity/recent?hours=48&dir=all`).catch(()=>({ items: [] })),
  ]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Dashboard</h1>
          {status?.outbound_paused && (
            <div className="mt-3 rounded-xl border border-danger-500/40 bg-danger-500/10 text-danger-500 px-4 py-3">
              Outbound is paused for this account.
            </div>
          )}
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Sends (7d)', value: metrics?.sends_7d ?? metrics?.sent ?? 0 },
            { label: 'Replies (7d)', value: metrics?.replies_7d ?? metrics?.replies ?? 0 },
            { label: 'Bookings (7d)', value: metrics?.bookings_7d ?? metrics?.booked ?? 0 },
            { label: 'Opt-outs (7d)', value: metrics?.optouts_7d ?? metrics?.optouts ?? 0 },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-border bg-elev1 p-5 shadow-card">
              <div className="text-sm text-muted">{k.label}</div>
              <div className="mt-2 text-3xl font-semibold">{k.value}</div>
            </div>
          ))}
        </div>

        {/* Emergency toggle */}
        <div className="rounded-2xl border border-border bg-elev1 p-5 shadow-card">
          <PauseToggle />
        </div>

        {/* Activity */}
        <div className="rounded-2xl border border-border bg-elev1 shadow-card">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-lg font-semibold">Recent activity (48h)</h2>
          </div>
          <ul className="divide-y divide-border">
            {(activity?.items ?? []).slice(0, 100).map((it: any, i: number) => (
              <li key={i} className="px-5 py-3 flex items-center gap-3 even:bg-elev2/40">
                <span className={`inline-block h-2 w-2 rounded-full ${it.dir === 'in' ? 'bg-emerald-500' : 'bg-brand-500'}`} />
                <span className="text-xs text-muted">{new Date(it.at).toLocaleString()}</span>
                <span className="truncate">{it.body}</span>
              </li>
            ))}
            {(!activity?.items || activity.items.length === 0) && (
              <li className="px-5 py-6 text-muted">No recent messages yet.</li>
            )}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
