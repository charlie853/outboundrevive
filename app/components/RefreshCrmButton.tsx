'use client';

import { useState, useEffect } from 'react';
import { authenticatedFetch } from '@/lib/api-client';

export default function RefreshCrmButton({ onRefresh }: { onRefresh?: () => void }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Fetch the last sync time on mount and after each sync
  const fetchLastSyncTime = async () => {
    try {
      const response = await authenticatedFetch('/api/crm/status');
      if (response.ok) {
        const data = await response.json();
        if (data.lastSyncedAt) {
          setLastSyncedAt(data.lastSyncedAt);
        }
      }
    } catch (error) {
      console.error('Failed to fetch last sync time:', error);
    }
  };

  useEffect(() => {
    fetchLastSyncTime();
    // Poll every 60 seconds to update the "last synced" time
    const interval = setInterval(fetchLastSyncTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    try {
      setIsSyncing(true);
      setMessage(null);

      const response = await authenticatedFetch('/api/crm/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ strategy: 'append' }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to sync CRM');
      }

      const data = await response.json();
      const result = data.results;

      if (result) {
        setMessage(
          `Synced ${result.created + result.updated} contacts (${result.created} new, ${result.updated} updated)`
        );
      } else {
        setMessage('Sync completed');
      }

      // Update last sync time
      setLastSyncedAt(new Date().toISOString());

      // Call the onRefresh callback to reload data
      onRefresh?.();

      // Clear message after 5 seconds
      setTimeout(() => setMessage(null), 5000);
    } catch (error) {
      console.error('CRM refresh error:', error);
      setMessage(error instanceof Error ? error.message : 'Failed to sync CRM');
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const formatLastSyncTime = (isoString: string | null) => {
    if (!isoString) return 'Never';
    
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className="relative">
      <button
        onClick={handleRefresh}
        disabled={isSyncing}
        className={`px-4 py-2 rounded-pill font-medium text-sm transition-colors ${
          isSyncing
            ? 'bg-amber-500/50 text-white border border-amber-500/50 cursor-not-allowed'
            : 'bg-white/10 text-white border border-white/30 hover:bg-white/20'
        }`}
        title={lastSyncedAt ? `Last synced: ${formatLastSyncTime(lastSyncedAt)} • Auto-syncs hourly` : 'Sync CRM leads now'}
      >
        {isSyncing ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Syncing…
          </span>
        ) : (
          'Refresh CRM'
        )}
      </button>
      {message && (
        <div
          className={`absolute top-full mt-2 right-0 text-xs px-3 py-2 rounded-lg shadow-lg whitespace-nowrap ${
            message.includes('Failed') || message.includes('error')
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}

