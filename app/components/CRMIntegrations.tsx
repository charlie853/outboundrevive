'use client';

import { useState } from 'react';
import Nango from '@nangohq/frontend';
import { authenticatedFetch } from '@/lib/api-client';

interface CRMIntegrationsProps {
  userId: string;
  userEmail?: string;
  organizationId?: string;
  onConnect?: (connectionId: string, providerConfigKey: string) => void;
  onSync?: (results: any) => void;
  onError?: (error: string) => void;
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
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [connectedCRM, setConnectedCRM] = useState<{connectionId: string, provider: string} | null>(null);
  const [nango] = useState(() => new Nango());

  const handleConnectCRM = async () => {
    try {
      setIsConnecting(true);

      const connect = nango.openConnectUI({
        onEvent: (event) => {
          if (event.type === 'close') {
            setIsConnecting(false);
          } else if (event.type === 'connect') {
            setIsConnecting(false);
            setConnectedCRM({
              connectionId: event.payload.connectionId,
              provider: event.payload.providerConfigKey
            });
            onConnect?.(event.payload.connectionId, event.payload.providerConfigKey);
          }
        },
      });

      const response = await authenticatedFetch('/api/crm/session-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId, // Optional: only pass organizationId for additional tagging
        }),
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
    if (!connectedCRM) return;
    
    try {
      setIsPreviewing(true);
      
      const response = await authenticatedFetch('/api/crm/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connectionId: connectedCRM.connectionId,
          integrationId: connectedCRM.provider,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to preview CRM contacts');
      }

      const preview = await response.json();
      setPreviewData(preview);
      setShowSyncModal(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to preview CRM contacts';
      onError?.(errorMessage);
      console.error('CRM preview error:', error);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleConfirmSync = async (mode: 'append' | 'overwrite') => {
    if (!connectedCRM) return;
    
    try {
      setIsSyncing(true);
      setShowSyncModal(false);
      
      const response = await authenticatedFetch('/api/crm/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connectionId: connectedCRM.connectionId,
          integrationId: connectedCRM.provider,
          mode,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to sync CRM contacts');
      }

      const results = await response.json();
      onSync?.(results);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync CRM contacts';
      onError?.(errorMessage);
      console.error('CRM sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">CRM Integrations</h2>
      
      {!connectedCRM ? (
        <>
          <button
            onClick={handleConnectCRM}
            disabled={isConnecting}
            className={`
              px-6 py-2 rounded-lg font-medium transition-colors
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
              ✅ Connected to <strong>{connectedCRM.provider}</strong>
            </p>
            <p className="text-sm text-green-600 mt-1">
              Connection ID: {connectedCRM.connectionId}
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
              onClick={() => setConnectedCRM(null)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Disconnect
            </button>
          </div>
        </>
      )}

      {/* Sync Confirmation Modal */}
      {showSyncModal && previewData && (
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
              <p className="text-gray-700 mb-2">Found contacts in your {connectedCRM?.provider}:</p>
              <div className="bg-gray-50 p-3 rounded border">
                <div className="text-sm">
                  <p><strong>{previewData.preview.totalContacts}</strong> total contacts</p>
                  <p><strong>{previewData.preview.validContacts}</strong> with valid phone numbers</p>
                  {previewData.preview.invalidContacts > 0 && (
                    <p className="text-amber-600">
                      <strong>{previewData.preview.invalidContacts}</strong> will be skipped (no valid phone)
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