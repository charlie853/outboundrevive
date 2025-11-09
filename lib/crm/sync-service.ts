import { Nango } from '@nangohq/node';
import { createCRMAdapter } from './factory';
import { CRMContact, CRMProvider, SyncResult, SyncStrategy } from './types';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { toE164 } from '@/lib/phone';
import { queueIntroForLead } from '@/lib/autotexter/queue';

function getNangoClient() {
  const secretKey = process.env.NANGO_SECRET_KEY;
  if (!secretKey) {
    throw new Error('NANGO_SECRET_KEY environment variable is not set');
  }
  return new Nango({
    secretKey: secretKey.trim().replace(/['"]/g, ''),
    host: process.env.NANGO_HOST || 'https://api.nango.dev',
  });
}

export interface CrmConnectionDescriptor {
  accountId: string;
  provider: CRMProvider;
  connectionId?: string;
  accessToken?: string;
}

export interface SyncExecutionOptions extends CrmConnectionDescriptor {
  strategy: SyncStrategy;
}

export async function loadActiveCrmConnection(accountId: string): Promise<CrmConnectionDescriptor | null> {
  const { data, error } = await supabaseAdmin
    .from('crm_connections')
    .select('provider, nango_connection_id, connection_metadata')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  if (!data) return null;

  // Try to extract the access token from metadata as a fallback
  const storedToken = data.connection_metadata?.access_token;

  return {
    accountId,
    provider: data.provider as CRMProvider,
    connectionId: data.nango_connection_id,
    accessToken: storedToken || undefined, // Include stored token if available
  };
}

export async function fetchCrmContacts(options: SyncExecutionOptions): Promise<{ contacts: CRMContact[]; connection: any }> {
  let connection: any = null;
  let accessToken = options.accessToken;

  // Always try to fetch fresh token from Nango first if we have a connectionId
  if (options.connectionId) {
    try {
      console.log('[sync-service] Fetching fresh Nango connection for provider:', options.provider, 'connectionId:', options.connectionId);
      const nango = getNangoClient();
      // Nango SDK expects (integrationId, connectionId) where integrationId is the provider config key
      connection = await nango.getConnection(options.provider, options.connectionId);
      console.log('[sync-service] Nango connection retrieved:', {
        hasCredentials: !!connection?.credentials,
        hasAccessToken: !!connection?.credentials?.access_token,
      });
      accessToken = connection?.credentials?.access_token;
      
      // Update the stored token in the database for future fallback
      if (accessToken) {
        console.log('[sync-service] Updating stored access token in database');
        await supabaseAdmin
          .from('crm_connections')
          .update({
            connection_metadata: {
              access_token: accessToken,
              updated_at: new Date().toISOString(),
            },
          })
          .eq('account_id', options.accountId)
          .eq('nango_connection_id', options.connectionId);
      }
    } catch (nangoError: any) {
      console.error('[sync-service] Nango getConnection error:', {
        message: nangoError.message,
        status: nangoError.response?.status,
        statusText: nangoError.response?.statusText,
        data: nangoError.response?.data,
        provider: options.provider,
        connectionId: options.connectionId,
      });
      
      // If Nango fails, try the stored token as fallback
      if (options.accessToken) {
        console.log('[sync-service] Falling back to stored access token');
        accessToken = options.accessToken;
      } else {
        throw new Error(
          `Failed to fetch CRM connection from Nango: ${nangoError.response?.data?.error || nangoError.message}. ` +
          `The connection may have expired. Please reconnect your CRM.`
        );
      }
    }
  } else if (accessToken) {
    console.log('[sync-service] Using stored access token (no connectionId available)');
  }

  if (!accessToken) {
    throw new Error('No access token available for CRM sync. Please reconnect your CRM.');
  }

  console.log('[sync-service] Fetching contacts from CRM adapter for provider:', options.provider);
  const adapter = createCRMAdapter(options.provider);
  const contacts = await adapter.syncContacts(accessToken, options.strategy, { connection });
  console.log('[sync-service] Fetched', contacts.length, 'contacts from CRM');

  return { contacts, connection };
}

export async function syncContactsToLeads(
  options: SyncExecutionOptions,
  contacts: CRMContact[]
): Promise<SyncResult> {
  const { accountId, provider, strategy } = options;
  const nowIso = new Date().toISOString();

  if (strategy === 'overwrite') {
    // Remove only leads sourced from this CRM to avoid touching manually added leads
    await supabaseAdmin
      .from('leads')
      .delete()
      .eq('account_id', accountId)
      .eq('crm_source', provider);
  }

  const { data: existingLeads, error: existingError } = await supabaseAdmin
    .from('leads')
    .select(
      'id, phone, email, crm_id, crm_source, last_reply_at, last_sent_at, lead_type, name, company, crm_owner, crm_owner_email, crm_status, crm_stage, crm_description, last_crm_sync_at'
    )
    .eq('account_id', accountId);

  if (existingError) {
    throw existingError;
  }

  const byCrmId = new Map<string, any>();
  const byPhone = new Map<string, any>();
  const byEmail = new Map<string, any>();

  for (const lead of existingLeads || []) {
    if (lead.crm_id && lead.crm_source) {
      byCrmId.set(`${lead.crm_source}:${lead.crm_id}`, lead);
    }
    if (lead.phone) {
      byPhone.set(lead.phone, lead);
    }
    if (lead.email) {
      byEmail.set(String(lead.email).toLowerCase(), lead);
    }
  }

  const seenContacts = new Set<string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  const normalizeTimestamp = (value?: string | null): string | null => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  for (const contact of contacts) {
    try {
      const phoneE164 = contact.phone ? toE164(contact.phone) : null;

      if (!phoneE164) {
        console.log('[sync-service] Skipping contact without valid phone', {
          name: contact.name,
          id: contact.id,
          rawPhone: contact.phone,
        });
        skipped++;
        continue;
      }

      const dedupeKey = `${provider}:${phoneE164}`;
      if (seenContacts.has(dedupeKey)) {
        skipped++;
        continue;
      }

      const crmKey = contact.id ? `${provider}:${contact.id}` : null;
      let existing = crmKey ? byCrmId.get(crmKey) : null;

      if (!existing) {
        existing = byPhone.get(phoneE164);
      }

      if (!existing && contact.email) {
        existing = byEmail.get(contact.email.toLowerCase());
      }

      const crmLastActivity = normalizeTimestamp(contact.last_activity_at);
      const crmStatus = contact.status || null;
      const crmStage = contact.stage || contact.status || null;
      const crmDescription = contact.description ? contact.description.trim() || null : null;

      if (existing) {
        const updatePayload: Record<string, any> = {
          last_crm_sync_at: nowIso,
        };

        if (crmKey && !existing.crm_id) updatePayload.crm_id = contact.id;
        if (!existing.crm_source && crmKey) updatePayload.crm_source = provider;
        if (contact.name && contact.name !== existing.name) updatePayload.name = contact.name;
        if (contact.email && contact.email !== existing.email) updatePayload.email = contact.email;
        if (contact.company && contact.company !== existing.company) updatePayload.company = contact.company;
        if (contact.owner !== undefined) updatePayload.crm_owner = contact.owner || null;
        if (contact.owner_email !== undefined) updatePayload.crm_owner_email = contact.owner_email || null;
        if (crmStatus !== existing.crm_status) updatePayload.crm_status = crmStatus;
        if (crmStage !== existing.crm_stage) updatePayload.crm_stage = crmStage;
        if (crmDescription !== existing.crm_description) updatePayload.crm_description = crmDescription;
        if (crmLastActivity) updatePayload.crm_last_activity_at = crmLastActivity;

        if (!existing.lead_type) {
          updatePayload.lead_type = 'old';
        }

        if (Object.keys(updatePayload).length > 1) {
          const { error: updateError } = await supabaseAdmin
            .from('leads')
            .update(updatePayload)
            .eq('id', existing.id);

          if (updateError) {
            throw updateError;
          }

          Object.assign(existing, updatePayload);
          if (crmKey) {
            byCrmId.set(crmKey, existing);
          }
          updated++;
        } else {
          skipped++;
        }
      } else {
        const insertPayload: Record<string, any> = {
          account_id: accountId,
          name: contact.name || 'Unknown',
          phone: phoneE164,
          email: contact.email || null,
          company: contact.company || null,
          status: 'pending',
          crm_id: contact.id || null,
          crm_source: provider,
          crm_owner: contact.owner || null,
          crm_owner_email: contact.owner_email || null,
          crm_status: crmStatus,
          crm_stage: crmStage,
          crm_description: crmDescription,
          crm_last_activity_at: crmLastActivity,
          last_crm_sync_at: nowIso,
          lead_type: 'new',
        };

        const { data: inserted, error: insertError } = await supabaseAdmin
          .from('leads')
          .insert(insertPayload)
          .select('id, phone, email, crm_id, crm_source, name, company, lead_type, crm_owner, crm_owner_email, crm_status, crm_stage, crm_description, crm_last_activity_at, intro_sent_at')
          .maybeSingle();

        if (insertError) {
          throw insertError;
        }

        if (inserted) {
          const newLead = inserted;
          if (newLead.crm_id) {
            byCrmId.set(`${provider}:${newLead.crm_id}`, newLead);
          }
          if (newLead.phone) {
            byPhone.set(newLead.phone, newLead);
          }
          if (newLead.email) {
            byEmail.set(String(newLead.email).toLowerCase(), newLead);
          }

          console.log('[sync-service] Created new lead, queueing intro', {
            leadId: newLead.id,
            name: newLead.name,
            phone: newLead.phone,
            hasIntroSent: !!newLead.intro_sent_at,
          });

          await queueIntroForLead(accountId, {
            id: newLead.id,
            name: newLead.name,
            phone: newLead.phone,
            email: newLead.email,
            company: newLead.company,
            crm_owner: insertPayload.crm_owner,
            crm_status: crmStatus,
            crm_stage: crmStage,
            crm_description: crmDescription,
            crm_last_activity_at: crmLastActivity,
            intro_sent_at: newLead.intro_sent_at,
          });
        }

        created++;
      }

      seenContacts.add(dedupeKey);
    } catch (error: any) {
      errors.push(
        `Failed to process contact ${contact.name || contact.id || 'unknown'}: ${
          error?.message || 'unknown error'
        }`
      );
      skipped++;
    }
  }

  // Update CRM connection metadata
  if (options.connectionId) {
    await supabaseAdmin
      .from('crm_connections')
      .update({ last_synced_at: nowIso })
      .eq('account_id', accountId)
      .eq('nango_connection_id', options.connectionId);
  }

  return {
    total: contacts.length,
    processed: created + updated,
    created,
    updated,
    skipped,
    errors,
  };
}

export async function executeCrmSync(options: SyncExecutionOptions): Promise<{ contacts: CRMContact[]; result?: SyncResult }> {
  const { contacts } = await fetchCrmContacts(options);

  if (options.strategy === 'preview') {
    return { contacts };
  }

  const result = await syncContactsToLeads(options, contacts);
  return { contacts, result };
}

