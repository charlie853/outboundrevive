export interface CRMContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
}

export interface SyncResult {
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export type SyncStrategy = 'append' | 'overwrite' | 'preview';
export type CRMProvider = 'hubspot' | 'salesforce' | 'pipedrive' | 'zoho';

export interface CRMAdapter {
  syncContacts(token: string, strategy: SyncStrategy): Promise<CRMContact[]>;
  disconnect(token: string): Promise<void>;
}