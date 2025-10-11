'use client';

import { useState, useEffect } from 'react';
import Nango from '@nangohq/frontend';
import { authenticatedFetch } from '@/lib/api-client';
import { CRMContact, SyncResult } from '@/lib/crm/types';

interface CRMIntegrationsProps {
  userId: string;
  userEmail?: string;
  organizationId?: string;
  onConnect?: (connectionId: string, providerConfigKey: string) => void;
  onSync?: (results: SyncResult) => void;
  onError?: (error: string) => void;
}

interface CRMStatus {
  connected: boolean;
  provider: string | null;
}

export default function CRMIntegrations({
  userId,
  userEmail,
  organizationId,
  onConnect,
  onSync,
  onError
}: CRMIntegrationsProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [previewData, setPreviewData] = useState<CRMContact[]>([]);
  const [crmStatus, setCrmStatus] = useState<CRMStatus>({ connected: false, provider: null });
  const [nango] = useState(() => new Nango());

  // Check CRM connection status on mount
  useEffect(() => {
    checkCRMStatus();
  }, []);

  const checkCRMStatus = async () => {
    try {
      const response = await authenticatedFetch('/api/crm/status');
      if (response.ok) {
        const status = await response.json();
        setCrmStatus(status);
      }
    } catch (error) {
      console.error('Failed to check CRM status:', error);
    }
  };

  const handleConnectCRM = async () => {
    try {
      setIsConnecting(true);

      const connect = nango.openConnectUI({
        themeOverride: "light",
        onEvent: async (event) => {
          if (event.type === 'close') {
            setIsConnecting(false);
          } else if (event.type === 'connect') {
            try {
              // Save the connection to database
              const response = await authenticatedFetch('/api/crm/connect', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  connectionId: event.payload.connectionId,
                  providerConfigKey: event.payload.providerConfigKey,
                }),
              });

              if (!response.ok) {
                throw new Error('Failed to save CRM connection');
              }

              // Update CRM status and refresh
              await checkCRMStatus();
              onConnect?.(event.payload.connectionId, event.payload.providerConfigKey);
            } catch (error) {
              console.error('Error saving CRM connection:', error);
              onError?.('Connection established but failed to save. Please try again.');
            } finally {
              setIsConnecting(false);
            }
          }
        },
      });

      const response = await authenticatedFetch('/api/crm/session-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.log(response.body);
        throw new Error('Failed to get session token');
      }

      const { sessionToken } = await response.json();
      connect.setSessionToken(sessionToken);
    } catch (error) {
      setIsConnecting(false);
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to CRM';
      onError?.(errorMessage);
      console.error('CRM connection error:', error);
    }
  };

  const handlePreviewSync = async () => {
    if (!crmStatus.connected) return;

    try {
      setIsPreviewing(true);

      const response = await authenticatedFetch('/api/crm/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          strategy: 'preview',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to preview CRM contacts');
      }

      const result = await response.json();
      setPreviewData(result.contacts || []);
      setShowSyncModal(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to preview CRM contacts';
      onError?.(errorMessage);
      console.error('CRM preview error:', error);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleConfirmSync = async (strategy: 'append' | 'overwrite') => {
    if (!crmStatus.connected) return;

    try {
      setIsSyncing(true);
      setShowSyncModal(false);

      const response = await authenticatedFetch('/api/crm/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ strategy }),
      });

      if (!response.ok) {
        throw new Error('Failed to sync CRM contacts');
      }

      const result = await response.json();
      onSync?.(result.results);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync CRM contacts';
      onError?.(errorMessage);
      console.error('CRM sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnectCRM = async () => {
    try {
      setIsDisconnecting(true);

      const response = await authenticatedFetch('/api/crm/disconnect', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect CRM');
      }

      setCrmStatus({ connected: false, provider: null });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect CRM';
      onError?.(errorMessage);
      console.error('CRM disconnect error:', error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="p-4 text-gray-600">
      {!crmStatus.connected ? (
        <>
          <button
            onClick={handleConnectCRM}
            disabled={isConnecting}
            className={`
              px-6 py-2 rounded-lg font-medium transition-colors cursor-pointer
              ${isConnecting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            {isConnecting ? 'Connecting...' : 'Connect CRM'}
          </button>
        </>
      ) : (
        <>
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800">
              ✅ Connected to <strong>{crmStatus.provider}</strong>
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handlePreviewSync}
              disabled={isPreviewing || isSyncing}
              className={`
                px-6 py-2 rounded-lg font-medium transition-colors
                ${isPreviewing || isSyncing
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
                }
              `}
            >
              {isPreviewing ? 'Loading...' : isSyncing ? 'Syncing...' : 'Sync Contacts'}
            </button>

            <button
              onClick={handleDisconnectCRM}
              disabled={isDisconnecting}
              className={`px-4 py-2 border border-gray-300 rounded-lg transition-colors ${
                isDisconnecting
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        </>
      )}

      {/* Sync Confirmation Modal */}
      {showSyncModal && previewData.length > 0 && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
          onClick={() => setShowSyncModal(false)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Sync CRM Contacts</h3>

            <div className="mb-6">
              <p className="text-gray-700 mb-2">Found contacts in your {crmStatus.provider}:</p>
              <div className="bg-gray-50 p-3 rounded border">
                <div className="text-sm">
                  <p><strong>{previewData.length}</strong> total contacts</p>
                  <p><strong>{previewData.filter(c => c.phone).length}</strong> with valid phone numbers</p>
                  {previewData.filter(c => !c.phone).length > 0 && (
                    <p className="text-amber-600">
                      <strong>{previewData.filter(c => !c.phone).length}</strong> will be skipped (no phone)
                    </p>
                  )}
                </div>
              </div>
            </div>

            <p className="text-gray-600 mb-4">How would you like to sync these contacts?</p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleConfirmSync('append')}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Append New Contacts
                <div className="text-xs text-blue-200">Add new contacts, keep existing ones</div>
              </button>

              <button
                onClick={() => handleConfirmSync('overwrite')}
                className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Overwrite All Contacts
                <div className="text-xs text-red-200">Replace all existing contacts with CRM data</div>
              </button>

              <button
                onClick={() => setShowSyncModal(false)}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}