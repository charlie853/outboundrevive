'use client';

import { useState } from 'react';
import { authenticatedFetch } from '@/lib/api-client';

export default function RefreshCrmButton({ onRefresh }: { onRefresh?: () => void }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleRefresh}
        disabled={isSyncing}
        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
          isSyncing
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-emerald-600 text-white hover:bg-emerald-700'
        }`}
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
          '🔄 Refresh CRM'
        )}
      </button>
      {message && (
        <div
          className={`text-sm px-3 py-1 rounded ${
            message.includes('Failed') || message.includes('error')
              ? 'bg-red-50 text-red-700'
              : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}

