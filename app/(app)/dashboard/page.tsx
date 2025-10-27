import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import KpiCards from './components/KpiCards';
import TimeRange from './components/TimeRange';
import RecentActivity from './components/RecentActivity';
import DeliveryChart from './components/DeliveryChart';
import RepliesChart from './components/RepliesChart';
import Funnel from './components/Funnel';
import UserInfo from './components/UserInfo';
import { headers, cookies } from 'next/headers';
import ThreadsPanel from '@/app/components/ThreadsPanel';
import MetricsPanel from '@/app/components/MetricsPanel';

export const metadata: Metadata = pageMeta('Dashboard — OutboundRevive', 'Metrics for your SMS outreach', '/dashboard') as any;

export default async function DashboardPage({ searchParams }: { searchParams: { range?: string } }) {
  const range = (searchParams?.range ?? '7d') as '7d'|'30d'|'90d';
  // Build absolute URL from request headers so Node fetch can resolve it and include session cookies
  const h = await headers();
  const c = await cookies();
  const proto = h.get('x-forwarded-proto') || 'http';
  const host = h.get('host') || 'localhost:3000';
  const base = `${proto}://${host}`;
  const cookieHeader = c.getAll().map(({ name, value }) => `${name}=${value}`).join('; ');
  const r = await fetch(`${base}/api/metrics/last7d?range=${range}`, { cache: 'no-store', headers: { cookie: cookieHeader } });
  const defaultPayload = {
    range,
    days: [] as any[],
    kpis: { leadsNew: 0, sent: 0, delivered: 0, deliveredRate: 0, replies: 0, deltas: { leadsNew: 0, sent: 0, deliveredRate: 0, replies: 0 } },
    funnel: { leads: 0, sent: 0, delivered: 0, replied: 0 }
  };
  let data: any = defaultPayload;
  try {
    const j = await r.json();
    if (r.ok && j && typeof j === 'object' && 'kpis' in j) {
      data = j;
    }
  } catch { /* keep defaults */ }
  const showNotice = !r.ok;

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Dashboard</h1>
          <UserInfo />
        </div>
        <TimeRange current={range} />
      </div>

      {showNotice && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
          Metrics temporarily unavailable. If you’re not signed in, please sign in and refresh.
        </div>
      )}

      <KpiCards data={data.kpis} className="mt-6" />

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <DeliveryChart days={data.days} />
        <RepliesChart days={data.days} />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Funnel data={data.funnel} />
        <RecentActivity hours={range === '7d' ? 168 : range === '30d' ? 720 : 2160} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <MetricsPanel />
        <ThreadsPanel />
      </div>
    </main>
  );
}
