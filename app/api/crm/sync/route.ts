import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { createCRMAdapter } from '@/lib/crm/factory';
import { CRMProvider, SyncStrategy, CRMContact, SyncResult } from '@/lib/crm/types';
import { getCurrentUserAccountId } from '@/lib/account';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { strategy }: { strategy: SyncStrategy } = await request.json();

    if (!['append', 'overwrite', 'preview'].includes(strategy)) {
      return NextResponse.json({ error: 'Invalid strategy' }, { status: 400 });
    }

    const accountId = await getCurrentUserAccountId();
    if (!accountId) {
      return NextResponse.json({ error: 'No account found' }, { status: 400 });
    }

    // Get user's CRM connection (NEW: from crm_connections table)
    const { data: crmConnection } = await supabaseAdmin
      .from('crm_connections')
      .select('provider, nango_connection_id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .single();

    // FALLBACK: Check old user_data table for backwards compatibility
    let provider: CRMProvider;
    let token: string;

    if (crmConnection) {
      provider = crmConnection.provider as CRMProvider;
      // Get token from Nango using connection ID
      // For now, we'll use the legacy approach - TODO: migrate to Nango SDK properly
      const { data: userData } = await supabaseAdmin
        .from('user_data')
        .select('nango_token, crm')
        .eq('user_id', user.id)
        .single();
      
      token = userData?.nango_token || '';
      if (!token) {
        return NextResponse.json({ error: 'No CRM token found' }, { status: 400 });
      }
    } else {
      // LEGACY fallback
      const { data: userData, error: userError } = await supabaseAdmin
        .from('user_data')
        .select('nango_token, crm')
        .eq('user_id', user.id)
        .single();

      if (userError || !userData?.nango_token || !userData?.crm) {
        return NextResponse.json({ error: 'No CRM connection found' }, { status: 400 });
      }

      provider = userData.crm as CRMProvider;
      token = userData.nango_token;
    }

    // Create CRM adapter and sync
    const adapter = createCRMAdapter(provider);
    const contacts = await adapter.syncContacts(token, strategy);

    // If preview, return contacts directly
    if (strategy === 'preview') {
      return NextResponse.json({
        success: true,
        contacts: contacts,
      });
    }

    // For actual sync, process contacts into leads
    const syncResult = await processContactsToLeads(contacts, accountId, provider, strategy);

    return NextResponse.json({
      success: true,
      results: syncResult,
    });
  } catch (error) {
    console.error('Error syncing CRM contacts:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}

async function processContactsToLeads(
  contacts: CRMContact[],
  accountId: string,
  crmSource: CRMProvider,
  strategy: SyncStrategy
): Promise<SyncResult> {
  try {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const nowIso = new Date().toISOString();

    // If overwrite, clear existing leads for this account
    if (strategy === 'overwrite') {
      await supabaseAdmin
        .from('leads')
        .delete()
        .eq('account_id', accountId);
    }

    for (const contact of contacts) {
      // Skip contacts without phone (required field)
      if (!contact.phone) {
        skipped++;
        continue;
      }

      try {
        // Check if lead already exists (by CRM ID first, then phone/email)
        let existingLead: any = null;
        
        if (contact.id) {
          const { data } = await supabaseAdmin
            .from('leads')
            .select('id, last_inbound_at, last_outbound_at')
            .eq('account_id', accountId)
            .eq('crm_id', contact.id)
            .eq('crm_source', crmSource)
            .single();
          existingLead = data;
        }
        
        if (!existingLead) {
          const { data } = await supabaseAdmin
            .from('leads')
            .select('id, last_inbound_at, last_outbound_at')
            .eq('account_id', accountId)
            .or(`phone.eq.${contact.phone}${contact.email ? `,email.eq.${contact.email}` : ''}`)
            .single();
          existingLead = data;
        }

        // CLASSIFICATION: Determine if lead is "new" (cold) or "old" (warm)
        // "old" = has prior conversation history (inbound or outbound)
        // "new" = no history, fresh lead
        const hasHistory = existingLead && (existingLead.last_inbound_at || existingLead.last_outbound_at);
        const leadType = hasHistory ? 'old' : 'new';

        // Build CRM URL (provider-specific)
        let crmUrl: string | null = null;
        if (contact.id) {
          if (crmSource === 'hubspot') {
            crmUrl = `https://app.hubspot.com/contacts/${contact.id}`;
          } else if (crmSource === 'salesforce') {
            crmUrl = `https://login.salesforce.com/${contact.id}`;
          } else if (crmSource === 'gohighlevel') {
            crmUrl = `https://app.gohighlevel.com/contacts/${contact.id}`;
          } else if (crmSource === 'zoho') {
            crmUrl = `https://crm.zoho.com/crm/EntityInfo?module=Contacts&id=${contact.id}`;
          }
        }

        // NEW: Enriched lead data with CRM metadata
        const leadData = {
          name: contact.name,
          phone: contact.phone,
          email: contact.email || null,
          account_id: accountId,
          status: 'pending',
          // NEW enrichment fields
          lead_type: leadType,
          company: contact.company || null,
          role: null, // CRMContact interface doesn't have role yet, but we're ready for it
          crm_id: contact.id,
          crm_source: crmSource,
          crm_url: crmUrl,
          last_crm_sync_at: nowIso,
        };

        if (existingLead) {
          // Update existing lead (preserve created_at)
          await supabaseAdmin
            .from('leads')
            .update(leadData)
            .eq('id', existingLead.id);
          updated++;
        } else {
          // Create new lead
          await supabaseAdmin
            .from('leads')
            .insert({
              ...leadData,
              created_at: nowIso,
            });
          created++;
        }
      } catch (error) {
        errors.push(`Failed to process ${contact.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        skipped++;
      }
    }

    return {
      total: contacts.length,
      processed: created + updated,
      created,
      updated,
      skipped,
      errors,
    };
  } catch (error) {
    throw new Error(`Failed to process contacts: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
