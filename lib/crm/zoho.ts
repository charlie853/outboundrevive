import { CRMAdapter, CRMContact, SyncResult, SyncStrategy } from './types';

export class ZohoAdapter implements CRMAdapter {
  private baseUrl = 'https://www.zohoapis.com/crm/v4';

  async syncContacts(token: string, strategy: SyncStrategy): Promise<CRMContact[]> {
    try {
      const contacts = await this.fetchAllContacts(token);
      return contacts;
    } catch (error) {
      console.error('Zoho sync error:', error);
      throw new Error(`Zoho sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(token: string): Promise<void> {
    try {
      // Revoke the Zoho token
      const response = await fetch('https://accounts.zoho.com/oauth/v2/token/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `token=${token}`,
      });

      if (!response.ok) {
        console.warn('Failed to revoke Zoho token, but continuing with disconnect');
      }
    } catch (error) {
      console.warn('Error revoking Zoho token:', error);
    }
  }

  private async fetchAllContacts(token: string): Promise<CRMContact[]> {
    const contacts: CRMContact[] = [];
    let page = 1;
    const perPage = 200;
    let hasMore = true;

    while (hasMore) {
      const url = `${this.baseUrl}/Contacts?fields=First_Name,Last_Name,Email,Phone,Account_Name&page=${page}&per_page=${perPage}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Zoho API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status === 'error') {
        throw new Error(`Zoho API error: ${data.message}`);
      }

      for (const contact of data.data || []) {
        const name = [contact.First_Name, contact.Last_Name].filter(Boolean).join(' ').trim();

        if (name && (contact.Email || contact.Phone)) {
          contacts.push({
            id: contact.id,
            name,
            email: contact.Email || undefined,
            phone: contact.Phone || undefined,
            company: contact.Account_Name || undefined,
          });
        }
      }

      hasMore = data.info?.more_records || false;
      page++;
    }

    return contacts;
  }

}