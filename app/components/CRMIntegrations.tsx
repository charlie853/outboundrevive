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
  variant?: 'full' | 'button';
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
  onError,
  variant = 'full'
}: CRMIntegrationsProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [previewData, setPreviewData] = useState<CRMContact[]>([]);
  const [crmStatus, setCrmStatus] = useState<CRMStatus>({ connected: false, provider: null });
  const [nango] = useState(() => {
    // Nango no longer uses public keys (deprecated) - we use session tokens instead
    // Just initialize with host (optional, defaults to https://api.nango.dev)
    const host = process.env.NEXT_PUBLIC_NANGO_HOST || 'https://api.nango.dev';
    
    return new Nango({
      host: host,
    });
  });

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
      console.log('[CRM] Starting connect flow...');

      // Get session token first (Nango uses session tokens, not public keys)
      console.log('[CRM] Fetching session token from /api/crm/session-token...');
      const tokenResponse = await authenticatedFetch('/api/crm/session-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('[CRM] Token response status:', tokenResponse.status, tokenResponse.ok);

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}));
        const errorMsg = errorData.error || `Failed to get session token (${tokenResponse.status})`;
        console.error('[CRM] Session token error:', errorData);
        throw new Error(errorMsg);
      }

      const tokenData = await tokenResponse.json();
      console.log('[CRM] Token data received:', { hasToken: !!tokenData.sessionToken });
      
      const { sessionToken } = tokenData;
      
      if (!sessionToken) {
        console.error('[CRM] No session token in response:', tokenData);
        throw new Error('No session token received from server');
      }

      console.log('[CRM] Opening Nango Connect UI...');
      
      // According to Nango docs: Open UI first, then set session token
      // Pattern: openConnectUI() → setSessionToken()
      try {
        console.log('[CRM] Calling openConnectUI...');
        const connect = nango.openConnectUI({
          themeOverride: "light",
          onEvent: async (event) => {
            console.log('[CRM] Nango event received:', event.type, event.payload);
            
            if (event.type === 'close') {
              console.log('[CRM] Popup closed by user');
              setIsConnecting(false);
              // User closed the popup - not necessarily an error
            } else if (event.type === 'connect') {
              console.log('[CRM] Connection successful:', event.payload);
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
                  const errorData = await response.json().catch(() => ({}));
                  throw new Error(errorData.error || 'Failed to save CRM connection');
                }

                console.log('[CRM] Connection saved to database');
                // Update CRM status and refresh
                await checkCRMStatus();
                onConnect?.(event.payload.connectionId, event.payload.providerConfigKey);
                setIsConnecting(false);
              } catch (error) {
                console.error('[CRM] Error saving CRM connection:', error);
                const errorMsg = error instanceof Error ? error.message : 'Connection established but failed to save. Please try again.';
                onError?.(errorMsg);
                setIsConnecting(false);
              }
            } else if (event.type === 'error') {
              console.error('[CRM] Nango error event:', event.payload);
              const errorMsg = event.payload?.error || 'An error occurred during connection';
              onError?.(errorMsg);
              setIsConnecting(false);
            }
          },
        });
        
        console.log('[CRM] openConnectUI called, connect object:', connect);
        
        // Set the session token AFTER opening the UI (Nango pattern)
        console.log('[CRM] Setting session token on connect object...');
        if (connect && typeof connect.setSessionToken === 'function') {
          connect.setSessionToken(sessionToken);
          console.log('[CRM] Session token set, popup should open now');
        } else {
          console.error('[CRM] Connect object does not have setSessionToken method:', connect);
          throw new Error('Failed to set session token - connect object invalid');
        }
      } catch (uiError) {
        console.error('[CRM] Error opening Connect UI:', uiError);
        throw new Error(`Failed to open Connect UI: ${uiError instanceof Error ? uiError.message : 'Unknown error'}`);
      }
    } catch (error) {
      setIsConnecting(false);
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to CRM';
      console.error('[CRM] Connection error:', error);
      onError?.(errorMessage);
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

  if (variant === 'button') {
    return (
      <div className="flex items-center gap-2 text-gray-600">
        {!crmStatus.connected ? (
          <button
            onClick={handleConnectCRM}
            disabled={isConnecting}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isConnecting
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isConnecting ? 'Connecting…' : 'Connect CRM'}
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-emerald-600">
              Connected to {crmStatus.provider ?? 'CRM'}
            </span>
            <button
              onClick={handleDisconnectCRM}
              disabled={isDisconnecting}
              className={`px-3 py-2 rounded-lg border transition-colors ${
                isDisconnecting
                  ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        )}
      </div>
    );
  }

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
