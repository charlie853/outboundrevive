import { CRMAdapter, CRMContact, SyncResult, SyncStrategy } from './types';

export class HubSpotAdapter implements CRMAdapter {
  private baseUrl = 'https://api.hubapi.com';

  async syncContacts(token: string, strategy: SyncStrategy): Promise<CRMContact[]> {
    try {
      const contacts = await this.fetchAllContacts(token);
      return contacts;
    } catch (error) {
      console.error('HubSpot sync error:', error);
      throw new Error(`HubSpot sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(token: string): Promise<void> {
    // HubSpot doesn't require explicit token revocation
    // Token will be removed from database
  }

  private async fetchAllContacts(token: string): Promise<CRMContact[]> {
    const contacts: CRMContact[] = [];
    let after: string | undefined;

    do {
      const url = new URL(`${this.baseUrl}/crm/v3/objects/contacts`);
      url.searchParams.set('properties', 'firstname,lastname,email,phone,company');
      url.searchParams.set('limit', '100');
      if (after) url.searchParams.set('after', after);

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      for (const contact of data.results || []) {
        const props = contact.properties || {};
        const name = [props.firstname, props.lastname].filter(Boolean).join(' ').trim();

        if (name && (props.email || props.phone)) {
          contacts.push({
            id: contact.id,
            name,
            email: props.email || undefined,
            phone: props.phone || undefined,
            company: props.company || undefined,
          });
        }
      }

      after = data.paging?.next?.after;
    } while (after);

    return contacts;
  }

}