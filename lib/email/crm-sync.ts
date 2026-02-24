import { Nango } from '@nangohq/node';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { loadActiveCrmConnection } from '@/lib/crm/sync-service';
import type { CRMProvider } from '@/lib/crm/types';

function getNangoClient() {
  const secretKey = process.env.NANGO_SECRET_KEY;
  if (!secretKey) throw new Error('NANGO_SECRET_KEY not set');
  return new Nango({
    secretKey: secretKey.trim().replace(/['"]/g, ''),
    host: process.env.NANGO_HOST || 'https://api.nango.dev',
  });
}

/**
 * Push email reply + labels to CRM (HubSpot first). Creates a note and optionally updates lifecycle stage.
 */
export async function pushEmailReplyToCrm(params: {
  accountId: string;
  leadId: string;
  replyBody: string;
  labels?: string[];
  threadId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const conn = await loadActiveCrmConnection(params.accountId);
  if (!conn?.connectionId) return { ok: false, error: 'No CRM connection' };

  let token: string;
  try {
    const nango = getNangoClient();
    const connection = await nango.getConnection(conn.provider, conn.connectionId);
    token = connection?.credentials?.access_token as string;
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Failed to get CRM token' };
  }
  if (!token) return { ok: false, error: 'No access token' };

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, email, name, crm_id, crm_source')
    .eq('id', params.leadId)
    .eq('account_id', params.accountId)
    .single();

  if (!lead?.email) return { ok: false, error: 'Lead has no email' };

  if ((conn.provider as string) === 'hubspot') {
    return pushReplyToHubSpot({
      token,
      lead: lead as any,
      replyBody: params.replyBody,
      labels: params.labels,
    });
  }

  return { ok: false, error: 'CRM write not implemented for ' + conn.provider };
}

async function pushReplyToHubSpot(params: {
  token: string;
  lead: { email: string; name?: string; crm_id?: string | null; crm_source?: string | null };
  replyBody: string;
  labels?: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = 'https://api.hubapi.com';
  let contactId = params.lead.crm_id && params.lead.crm_source === 'hubspot' ? params.lead.crm_id : null;

  if (!contactId) {
    const searchRes = await fetch(
      `${baseUrl}/crm/v3/objects/contacts/search`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: params.lead.email }] }],
          limit: 1,
        }),
      }
    );
    if (!searchRes.ok) return { ok: false, error: 'HubSpot search failed: ' + searchRes.statusText };
    const searchData = await searchRes.json();
    contactId = searchData.results?.[0]?.id ?? null;
  }

  if (!contactId) return { ok: false, error: 'Contact not found in HubSpot' };

  const noteBody = [
    '[OutboundRevive] Email reply received',
    '',
    params.replyBody,
    params.labels?.length ? `\nLabels: ${params.labels.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const createRes = await fetch(`${baseUrl}/crm/v3/objects/notes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { hs_note_body: noteBody },
      associations: [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    return { ok: false, error: 'HubSpot note failed: ' + err };
  }
  return { ok: true };
}
