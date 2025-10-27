export const revalidate = 0;
export const dynamic = 'force-dynamic';

import dynamic from 'next/dynamic';

const MetricsPanel = dynamic(() => import('@/components/MetricsPanel'), { ssr: false });
const ThreadsPanel = dynamic(() => import('@/components/ThreadsPanel'), { ssr: false });

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <MetricsPanel />
      <ThreadsPanel />
    </div>
  );
}
