export interface CRMContact {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  owner?: string;
  owner_email?: string;
  owner_id?: string;
  status?: string;
  stage?: string;
  description?: string;
  last_activity_at?: string;
  raw?: Record<string, any>;
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
export type CRMProvider = 'hubspot' | 'salesforce' | 'pipedrive' | 'zoho' | 'gohighlevel';

export interface CRMAdapter {
  syncContacts(token: string, strategy: SyncStrategy, context?: { connection?: any }): Promise<CRMContact[]>;
  disconnect(token: string): Promise<void>;
}