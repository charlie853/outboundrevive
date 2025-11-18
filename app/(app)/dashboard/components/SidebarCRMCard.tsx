'use client';

import { useState, useEffect } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';
import ConnectCrmButton from '@/app/components/ConnectCrmButton';
import { useMetricsData } from './useMetricsData';
import { useTimeRange } from './TimeRangeSelector';

function formatLastSyncTime(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return 'Never';
  
  try {
    const date = new Date(lastSyncedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } catch {
    return 'Unknown';
  }
}

export default function SidebarCRMCard() {
  const [crmStatus, setCrmStatus] = useState<{ connected: boolean; provider: string | null; lastSyncedAt: string | null }>({
    connected: false,
    provider: null,
    lastSyncedAt: null,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const { range } = useTimeRange();
  const { kpis } = useMetricsData(range);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await authenticatedFetch('/api/crm/status');
        if (response.ok) {
          const data = await response.json();
          setCrmStatus({
            connected: data.connected || false,
            provider: data.provider || null,
            lastSyncedAt: data.lastSyncedAt || null,
          });
        }
      } catch (error) {
        console.error('Failed to fetch CRM status:', error);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsSyncing(true);
    try {
      const response = await authenticatedFetch('/api/crm/sync', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        if (data.lastSyncedAt) {
          setCrmStatus(prev => ({ ...prev, lastSyncedAt: data.lastSyncedAt }));
        }
      }
    } catch (error) {
      console.error('Failed to sync CRM:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportCSV = () => {
    const csv = [
      ['Metric', 'Value', 'Delta'],
      ['New Leads', kpis.leadsNew, `${Math.round(kpis.deltas.leadsNew * 100)}%`],
      ['Messages Sent', kpis.sent, `${Math.round(kpis.deltas.sent * 100)}%`],
      ['Delivered Rate', `${Math.round(kpis.deliveredRate * 100)}%`, `${Math.round(kpis.deltas.deliveredRate * 100)}%`],
      ['Replies', kpis.replies, `${Math.round(kpis.deltas.replies * 100)}%`],
    ].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `outboundrevive-metrics-${range}.csv`;
    a.click();
  };

  return (
    <div className="bg-brand-700 rounded-2xl p-4 shadow-md">
      <h3 className="text-sm font-bold text-white mb-1">CRM Status</h3>
      {crmStatus.connected ? (
        <>
          <p className="text-xs text-white/70 mb-1">
            {crmStatus.provider || 'CRM'} connected
          </p>
          <p className="text-xs text-white/60 mb-3">
            Last sync: {formatLastSyncTime(crmStatus.lastSyncedAt)}
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleRefresh}
              disabled={isSyncing}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 text-xs font-medium text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Refresh CRM'}
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 text-xs font-medium text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              className="mt-1 text-xs text-brand-100 underline underline-offset-2 hover:text-white transition-colors text-center"
              onClick={() => {
                // TODO: wire up change CRM modal/action
                alert('Change CRM functionality coming soon');
              }}
            >
              Change CRM
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-white/70 mb-3">Not connected</p>
          <ConnectCrmButton onConnect={() => {}} />
        </>
      )}
    </div>
  );
}

