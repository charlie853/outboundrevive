'use client';

import { useState } from 'react';
import ConnectCrmButton from '@/app/components/ConnectCrmButton';
import RefreshCrmButton from '@/app/components/RefreshCrmButton';
import AutotexterToggle from '../../components/AutotexterToggle';
import MetricsPanel from '@/app/components/MetricsPanel';
import ThreadsPanel from '@/app/components/ThreadsPanel';

export default function DashboardClient() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCrmRefresh = () => {
    // Increment key to force ThreadsPanel to reload
    setRefreshKey(prev => prev + 1);
  };

  const handleCrmConnect = () => {
    // Wait a bit for the background sync to complete, then refresh
    setTimeout(() => {
      setRefreshKey(prev => prev + 1);
    }, 3000);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-1">Dashboard</h1>
          <p className="text-sm text-ink-3">Monitor outreach performance and jump back into conversations.</p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectCrmButton onConnect={handleCrmConnect} />
          <RefreshCrmButton onRefresh={handleCrmRefresh} />
          <AutotexterToggle />
        </div>
      </header>

      <MetricsPanel />

      <ThreadsPanel key={refreshKey} />
    </div>
  );
}

