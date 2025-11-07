import { CRMAdapter, CRMContact, SyncStrategy } from './types';

/**
 * GoHighLevel CRM Adapter
 * 
 * GoHighLevel (GHL) is popular with:
 * - Auto repair shops
 * - Multi-location businesses
 * - Marketing agencies
 * 
 * API Docs: https://highlevel.stoplight.io/docs/integrations/
 */
export class GoHighLevelAdapter implements CRMAdapter {
  private baseUrl = 'https://rest.gohighlevel.com/v1';

  async syncContacts(token: string, _strategy: SyncStrategy, _context?: { connection?: any }): Promise<CRMContact[]> {
    try {
      const contacts = await this.fetchAllContacts(token);
      return contacts;
    } catch (error) {
      console.error('GoHighLevel sync error:', error);
      throw new Error(`GoHighLevel sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(token: string): Promise<void> {
    // GoHighLevel doesn't require explicit token revocation
    // Token will be removed from database
  }

  private async fetchAllContacts(token: string): Promise<CRMContact[]> {
    const contacts: CRMContact[] = [];
    let skip = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = new URL(`${this.baseUrl}/contacts`);
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('skip', skip.toString());

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`GoHighLevel API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const results = data.contacts || [];

      for (const contact of results) {
        // GHL contact schema: { id, firstName, lastName, email, phone, companyName }
        const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();

        if (name && (contact.email || contact.phone)) {
          contacts.push({
            id: contact.id,
            name,
            email: contact.email || undefined,
            phone: contact.phone || undefined,
            company: contact.companyName || contact.businessName || undefined,
            owner: contact.assignedTo || contact.assignedUserName || undefined,
            owner_id: contact.assignedToId ? String(contact.assignedToId) : undefined,
            status: contact.leadStatus || contact.contactStatus || undefined,
            stage: contact.pipelineStage || undefined,
            description:
              contact.notes ||
              (Array.isArray(contact.tags) ? contact.tags.join(', ') : undefined),
            last_activity_at: contact.updatedAt || contact.lastActivityDate || undefined,
            raw: contact,
          });
        }
      }

      hasMore = results.length === limit;
      skip += limit;
    }

    return contacts;
  }
}

