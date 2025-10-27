export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';

import ConnectCrmButton from '@/app/components/ConnectCrmButton';
import MetricsPanel from '@/app/components/MetricsPanel';
import ThreadsPanel from '@/app/components/ThreadsPanel';

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-1">Dashboard</h1>
          <p className="text-sm text-ink-3">Monitor outreach performance and jump back into conversations.</p>
        </div>
        <ConnectCrmButton />
      </header>

      <MetricsPanel />

      <ThreadsPanel />
    </div>
  );
}
