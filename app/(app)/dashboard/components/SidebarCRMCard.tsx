'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, RefreshCw, X } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client';
import ConnectCrmButton from '@/app/components/ConnectCrmButton';
import CRMIntegrations from '@/app/components/CRMIntegrations';
import { useAuth } from '@/lib/auth-context';
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
  const { user } = useAuth();
  const [crmStatus, setCrmStatus] = useState<{ connected: boolean; provider: string | null; lastSyncedAt: string | null }>({
    connected: false,
    provider: null,
    lastSyncedAt: null,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [showChangeCrmModal, setShowChangeCrmModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { range } = useTimeRange();
  const { kpis } = useMetricsData(range);

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

  useEffect(() => {
    setMounted(true);
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (showChangeCrmModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showChangeCrmModal]);

  const handleCrmConnect = () => {
    // Refresh status after connection
    fetchStatus();
    setShowChangeCrmModal(false);
  };

  const handleCrmError = (error: string) => {
    console.error('[SidebarCRMCard] CRM error:', error);
    // Optionally show error toast/notification
  };

  const handleCloseModal = () => {
    setShowChangeCrmModal(false);
    // Refresh status when modal closes (in case user disconnected or made changes)
    fetchStatus();
  };

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
              onClick={() => setShowChangeCrmModal(true)}
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

      {/* Change CRM Modal - Rendered as Portal */}
      {showChangeCrmModal && mounted && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          style={{ zIndex: 99999 }}
          onClick={handleCloseModal}
        >
          <div
            className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl"
            style={{ zIndex: 100000 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 flex items-center justify-between p-6 border-b border-surface-line bg-white rounded-t-2xl z-10">
              <h2 className="text-xl font-bold text-ink-1">Change CRM Connection</h2>
              <button
                onClick={handleCloseModal}
                className="text-ink-3 hover:text-ink-1 transition-colors p-1 hover:bg-surface-bg rounded-lg"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 bg-white">
              {crmStatus.connected && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    You are currently connected to <strong>{crmStatus.provider}</strong>. 
                    Connecting a new CRM will disconnect the existing connection.
                  </p>
                </div>
              )}
              
              <CRMIntegrations
                variant="full"
                userId={user?.id ?? 'unknown-user'}
                userEmail={user?.email ?? undefined}
                organizationId="dashboard"
                onConnect={handleCrmConnect}
                onError={handleCrmError}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

