export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';


const MetricsPanel = dynamic(() => import('@/app/components/MetricsPanel'), { ssr: false });
const ThreadsPanel = dynamic(() => import('@/app/components/ThreadsPanel'), { ssr: false });

import MetricsPanel from '@/app/components/MetricsPanel';
import ThreadsPanel from '@/app/components/ThreadsPanel';

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <MetricsPanel />
      <ThreadsPanel />
    </div>
  );
}