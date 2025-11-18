'use client';

import { useState } from 'react';
import ConnectCrmButton from '@/app/components/ConnectCrmButton';
import RefreshCrmButton from '@/app/components/RefreshCrmButton';
import AutotexterToggle from '../../components/AutotexterToggle';
import MetricsPanel from '@/app/components/MetricsPanel';
import ThreadsPanel from '@/app/components/ThreadsPanel';
import VerticalInsights from './components/VerticalInsights';

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
    <div className="min-h-screen bg-gradient-to-b from-indigo-900 via-indigo-800 to-slate-900 text-white">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-white">Dashboard</h1>
            <p className="text-lg text-white/80 mt-3">Track outreach performance, specific conversations, and more.</p>
          </div>
          <div className="flex items-center gap-3">
            <ConnectCrmButton onConnect={handleCrmConnect} />
            <RefreshCrmButton onRefresh={handleCrmRefresh} />
            <AutotexterToggle />
          </div>
        </header>

        <MetricsPanel />
        <VerticalInsights />

        <ThreadsPanel key={refreshKey} />
      </div>
    </div>
  );
}

