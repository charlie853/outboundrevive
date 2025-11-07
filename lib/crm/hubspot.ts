import { CRMAdapter, CRMContact, SyncResult, SyncStrategy } from './types';

export class HubSpotAdapter implements CRMAdapter {
  private baseUrl = 'https://api.hubapi.com';

  async syncContacts(token: string, _strategy: SyncStrategy, _context?: { connection?: any }): Promise<CRMContact[]> {
    try {
      const owners = await this.fetchOwners(token);
      const contacts = await this.fetchAllContacts(token, owners);
      return contacts;
    } catch (error) {
      console.error('HubSpot sync error:', error);
      throw new Error(`HubSpot sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(_token: string): Promise<void> {
    // HubSpot doesn't require explicit token revocation
    // Token will be removed from database
  }

  private async fetchOwners(token: string): Promise<Map<string, { name?: string; email?: string }>> {
    const owners = new Map<string, { name?: string; email?: string }>();
    try {
      const url = new URL(`${this.baseUrl}/crm/v3/owners/`);
      url.searchParams.set('archived', 'false');

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HubSpot owners API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      for (const owner of data.results || []) {
        if (!owner.id) continue;
        owners.set(String(owner.id), {
          name: owner.firstName && owner.lastName ? `${owner.firstName} ${owner.lastName}`.trim() : owner.email || undefined,
          email: owner.email || undefined,
        });
      }
    } catch (error) {
      console.warn('HubSpot owners fetch failed, continuing without owner metadata:', error);
    }
    return owners;
  }

  private async fetchAllContacts(
    token: string,
    owners: Map<string, { name?: string; email?: string }>
  ): Promise<CRMContact[]> {
    const contacts: CRMContact[] = [];
    let after: string | undefined;

    do {
      const url = new URL(`${this.baseUrl}/crm/v3/objects/contacts`);
      url.searchParams.set(
        'properties',
        [
          'firstname',
          'lastname',
          'email',
          'phone',
          'company',
          'hubspot_owner_id',
          'hs_lead_status',
          'lifecyclestage',
          'description',
          'notes_last_activity_date',
          'lastmodifieddate',
        ].join(',')
      );
      url.searchParams.set('limit', '100');
      if (after) url.searchParams.set('after', after);

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      for (const contact of data.results || []) {
        const props = contact.properties || {};
        const first = (props.firstname || '').trim();
        const last = (props.lastname || '').trim();
        const name = [first, last].filter(Boolean).join(' ').trim() || props.firstname || props.lastname || '';
        const phone = props.phone || undefined;
        const email = props.email || undefined;

        if (!name || (!phone && !email)) {
          continue;
        }

        const ownerId = props.hubspot_owner_id ? String(props.hubspot_owner_id) : undefined;
        const ownerMeta = ownerId ? owners.get(ownerId) : undefined;

        contacts.push({
          id: contact.id,
          name,
          email,
          phone,
          company: props.company || undefined,
          owner: ownerMeta?.name || undefined,
          owner_email: ownerMeta?.email || undefined,
          owner_id: ownerId,
          status: props.hs_lead_status || undefined,
          stage: props.lifecyclestage || undefined,
          description: props.description || undefined,
          last_activity_at: props.notes_last_activity_date || props.lastmodifieddate || undefined,
          raw: contact,
        });
      }

      after = data.paging?.next?.after;
    } while (after);

    return contacts;
  }
}