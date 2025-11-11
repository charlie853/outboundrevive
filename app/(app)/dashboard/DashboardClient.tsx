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
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-sm text-white/80 mt-1">Monitor outreach performance and jump back into conversations.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ConnectCrmButton onConnect={handleCrmConnect} />
            <RefreshCrmButton onRefresh={handleCrmRefresh} />
            <AutotexterToggle />
          </div>
        </div>
      </header>

      <MetricsPanel />

      <ThreadsPanel key={refreshKey} />
    </div>
  );
}

