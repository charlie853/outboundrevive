import { CRMAdapter, CRMContact, SyncResult, SyncStrategy } from './types';

export class SalesforceAdapter implements CRMAdapter {
  async syncContacts(token: string, _strategy: SyncStrategy, context?: { connection?: any }): Promise<CRMContact[]> {
    try {
      const instanceUrl = this.resolveInstanceUrl(token, context);
      const contacts = await this.fetchAllContacts(token, instanceUrl);
      return contacts;
    } catch (error) {
      console.error('Salesforce sync error:', error);
      throw new Error(`Salesforce sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(_token: string): Promise<void> {
    // Salesforce token revocation would go here if needed
    // For now, just removing from database is sufficient
  }

  private resolveInstanceUrl(token: string, context?: { connection?: any }): string {
    const connection = context?.connection;
    const fromConnection =
      connection?.credentials?.raw?.instance_url ||
      connection?.connection_config?.instance_url ||
      connection?.metadata?.instance_url;

    if (fromConnection) {
      return fromConnection;
    }

    return this.getInstanceUrl(token);
  }

  private async fetchAllContacts(token: string, instanceUrl: string): Promise<CRMContact[]> {
    const contacts: CRMContact[] = [];
    let nextUrl: string | null = `${instanceUrl}/services/data/v58.0/query/?q=${encodeURIComponent(
      `SELECT Id, FirstName, LastName, Company, Email, Phone, MobilePhone, Owner.Name, Owner.Email, Status, Description, LastActivityDate 
       FROM Lead 
       WHERE (Email != null OR Phone != null OR MobilePhone != null) AND IsConverted = false`
    )}`;

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Salesforce API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      for (const record of data.records || []) {
        const name = [record.FirstName, record.LastName].filter(Boolean).join(' ').trim() || record.Company;
        const phone = record.Phone || record.MobilePhone || undefined;
        const email = record.Email || undefined;

        if (!name || (!phone && !email)) {
          continue;
        }

        contacts.push({
          id: record.Id,
          name,
          email,
          phone,
          company: record.Company || undefined,
          owner: record.Owner?.Name || undefined,
          owner_email: record.Owner?.Email || undefined,
          status: record.Status || undefined,
          stage: record.Status || undefined,
          description: record.Description || undefined,
          last_activity_at: record.LastActivityDate || undefined,
          raw: record,
        });
      }

      nextUrl = data.nextRecordsUrl ? `${instanceUrl}${data.nextRecordsUrl}` : null;
    }

    return contacts;
  }

  private getInstanceUrl(_token: string): string {
    // Fallback to login domain if instance could not be determined.
    // Many Salesforce orgs require the real instance URL; callers should prefer providing it via connection metadata.
    return 'https://login.salesforce.com';
  }
}