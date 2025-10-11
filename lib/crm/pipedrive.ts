import { CRMAdapter, CRMContact, SyncResult, SyncStrategy } from './types';

export class PipedriveAdapter implements CRMAdapter {
  private baseUrl = 'https://api.pipedrive.com/v1';

  async syncContacts(token: string, strategy: SyncStrategy): Promise<CRMContact[]> {
    try {
      const contacts = await this.fetchAllContacts(token);
      return contacts;
    } catch (error) {
      console.error('Pipedrive sync error:', error);
      throw new Error(`Pipedrive sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(token: string): Promise<void> {
    // Pipedrive doesn't require explicit token revocation
  }

  private async fetchAllContacts(token: string): Promise<CRMContact[]> {
    const contacts: CRMContact[] = [];
    let start = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `${this.baseUrl}/persons?start=${start}&limit=${limit}&api_token=${token}`;

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Pipedrive API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error('Pipedrive API returned error');
      }

      for (const person of data.data || []) {
        if (person.name && (person.email?.length > 0 || person.phone?.length > 0)) {
          contacts.push({
            id: person.id.toString(),
            name: person.name,
            email: person.email?.[0]?.value || undefined,
            phone: person.phone?.[0]?.value || undefined,
            company: person.org_name || undefined,
          });
        }
      }

      hasMore = data.additional_data?.pagination?.more_items_in_collection || false;
      start += limit;
    }

    return contacts;
  }

}