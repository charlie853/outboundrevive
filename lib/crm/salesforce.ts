import { CRMAdapter, CRMContact, SyncResult, SyncStrategy } from './types';

export class SalesforceAdapter implements CRMAdapter {
  private baseUrl = 'https://login.salesforce.com'; // Will be dynamic based on instance

  async syncContacts(token: string, strategy: SyncStrategy): Promise<CRMContact[]> {
    try {
      const contacts = await this.fetchAllContacts(token);
      return contacts;
    } catch (error) {
      console.error('Salesforce sync error:', error);
      throw new Error(`Salesforce sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(token: string): Promise<void> {
    // Salesforce token revocation would go here if needed
    // For now, just removing from database is sufficient
  }

  private async fetchAllContacts(token: string): Promise<CRMContact[]> {
    // First, we need to get the instance URL from the token info
    const instanceUrl = await this.getInstanceUrl(token);
    const contacts: CRMContact[] = [];

    const soql = `SELECT Id, FirstName, LastName, Email, Phone, Account.Name FROM Contact WHERE Email != null OR Phone != null LIMIT 2000`;
    const url = `${instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(soql)}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Salesforce API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    for (const record of data.records || []) {
      const name = [record.FirstName, record.LastName].filter(Boolean).join(' ').trim();

      if (name && (record.Email || record.Phone)) {
        contacts.push({
          id: record.Id,
          name,
          email: record.Email || undefined,
          phone: record.Phone || undefined,
          company: record.Account?.Name || undefined,
        });
      }
    }

    return contacts;
  }

  private async getInstanceUrl(token: string): Promise<string> {
    // In a real implementation, this would be stored during OAuth or retrieved from token introspection
    // For now, return a default
    return 'https://yourinstance.salesforce.com';
  }

}