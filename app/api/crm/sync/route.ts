import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireAccountAccess } from '@/lib/account';
import { Nango } from '@nangohq/node';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });

function toE164Loose(raw?: string | null) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\+\d{8,15}$/.test(s)) return s;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function normalizeContactData(contact: any, provider: string) {
  let name = '';
  let phone = '';
  let email = '';

  switch (provider) {
    case 'hubspot':
      name = `${contact.properties?.firstname || ''} ${contact.properties?.lastname || ''}`.trim();
      phone = contact.properties?.phone || '';
      email = contact.properties?.email || '';
      break;

    case 'salesforce':
      name = `${contact.FirstName || ''} ${contact.LastName || ''}`.trim();
      phone = contact.Phone || contact.MobilePhone || '';
      email = contact.Email || '';
      break;

    case 'pipedrive':
      name = contact.name || '';
      phone = contact.phone?.[0]?.value || contact.phone || '';
      email = contact.email?.[0]?.value || contact.email || '';
      break;

    case 'zoho':
      name = `${contact.First_Name || ''} ${contact.Last_Name || ''}`.trim();
      phone = contact.Phone || contact.Mobile || '';
      email = contact.Email || '';
      break;

    default:
      // Generic fallback
      name = contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
      phone = contact.phone || contact.mobile || '';
      email = contact.email || '';
  }

  return {
    name: name || null,
    phone: toE164Loose(phone),
    email: email || null
  };
}

export async function POST(req: NextRequest) {
  try {
    // Check authentication and get account ID
    const accountId = await requireAccountAccess();
    if (!accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { connectionId, integrationId, mode = 'append' } = await req.json();

    if (!connectionId || !integrationId) {
      return NextResponse.json(
        { error: 'connectionId and integrationId are required' },
        { status: 400 }
      );
    }

    console.log(`Starting CRM sync for connection ${connectionId} (${integrationId}) in ${mode} mode, account: ${accountId}`);

    // If overwrite mode, delete existing leads for this account only
    if (mode === 'overwrite') {
      console.log('Overwrite mode: clearing existing leads for account...');
      const { error: deleteError } = await supabaseAdmin
        .from('leads')
        .delete()
        .eq('account_id', accountId);

      if (deleteError) {
        console.error('Error clearing leads:', deleteError);
        return NextResponse.json(
          { error: 'Failed to clear existing leads', details: deleteError.message },
          { status: 500 }
        );
      }
      console.log('Existing leads cleared for account');
    }

    // Get the correct endpoint for each CRM provider
    let endpoint = '/contacts';
    if (integrationId === 'hubspot') {
      endpoint = '/crm/v3/objects/contacts?properties=phone,email,firstname,lastname';
    } else if (integrationId === 'salesforce') {
      endpoint = '/services/data/v58.0/sobjects/Contact';
    } else if (integrationId === 'pipedrive') {
      endpoint = '/persons';
    } else if (integrationId === 'zoho') {
      endpoint = '/crm/v2/Contacts';
    }

    console.log(`Fetching from endpoint: ${endpoint}`);

    // Fetch contacts from CRM via Nango
    let contacts;
    try {
      contacts = await nango.get({
        providerConfigKey: integrationId,
        connectionId: connectionId,
        endpoint: endpoint,
      });
    } catch (nangoError: any) {
      console.error('Nango API error:', nangoError);
      console.error('Error response:', nangoError.response?.data);
      console.error('Error status:', nangoError.response?.status);
      
      if (nangoError.response?.status === 404) {
        throw new Error(`Endpoint not found: ${endpoint}. This might mean the ${integrationId} integration is not properly configured in Nango or the endpoint path is incorrect.`);
      }
      
      throw new Error(`Failed to fetch contacts from ${integrationId}: ${nangoError.message}`);
    }

    console.log('Nango response status:', contacts.status);
    console.log('Nango response data keys:', Object.keys(contacts.data || {}));
    console.log('Nango response data sample:', contacts.data ? JSON.stringify(contacts.data).substring(0, 500) + '...' : 'null');

    // Handle different response structures
    let contactsArray: any[] = [];
    if (integrationId === 'hubspot') {
      // HubSpot API returns data in contacts.data.results
      contactsArray = contacts.data?.results || contacts.data || [];
    } else if (integrationId === 'salesforce') {
      // Salesforce API returns data in contacts.data.records
      contactsArray = contacts.data?.records || contacts.data || [];
    } else if (integrationId === 'pipedrive') {
      // Pipedrive API returns data in contacts.data.data
      contactsArray = contacts.data?.data || contacts.data || [];
    } else if (integrationId === 'zoho') {
      // Zoho API returns data in contacts.data.data
      contactsArray = contacts.data?.data || contacts.data || [];
    } else {
      // Generic handling for other CRMs
      contactsArray = contacts.data || [];
    }

    if (!Array.isArray(contactsArray)) {
      throw new Error(`Invalid response structure from ${integrationId}: expected array, got ${typeof contactsArray}`);
    }

    console.log(`Fetched ${contactsArray.length} contacts from ${integrationId}`);

    const results = {
      total: contactsArray.length,
      processed: 0,
      created: 0,
      updated: 0,
      errors: 0,
      errorDetails: [] as string[]
    };

    // Process each contact
    for (const contact of contactsArray) {
      try {
        console.log(`Processing contact ${contact.id}:`, JSON.stringify(contact, null, 2));
        const normalized = normalizeContactData(contact, integrationId);
        console.log(`Normalized data:`, normalized);
        
        if (!normalized.phone) {
          results.errors++;
          results.errorDetails.push(`Contact ${contact.id || 'unknown'}: No valid phone number (raw: ${integrationId === 'hubspot' ? contact.properties?.phone : contact.phone})`);
          console.log(`Skipping contact ${contact.id}: no valid phone`);
          continue;
        }

        // Insert or update lead with account_id
        console.log(`Inserting lead for contact ${contact.id} with phone ${normalized.phone}`);
        const { data: leadData, error: leadError } = await supabaseAdmin
          .from('leads')
          .upsert({
            name: normalized.name,
            phone: normalized.phone,
            email: normalized.email,
            status: 'pending',
            account_id: accountId
          }, {
            onConflict: 'phone',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (leadError) {
          results.errors++;
          results.errorDetails.push(`Lead upsert error: ${leadError.message}`);
          console.error(`Lead upsert error for contact ${contact.id}:`, leadError);
          continue;
        }

        console.log(`Successfully created/updated lead:`, leadData);

        // Insert or update CRM contact mapping with account_id
        const { error: crmError } = await supabaseAdmin
          .from('crm_contacts')
          .upsert({
            lead_id: leadData.id,
            nango_connection_id: connectionId,
            crm_contact_id: contact.id,
            crm_provider: integrationId,
            external_data: contact,
            last_synced_at: new Date().toISOString(),
            sync_status: 'synced',
            updated_at: new Date().toISOString(),
            account_id: accountId
          }, {
            onConflict: 'nango_connection_id,crm_contact_id',
            ignoreDuplicates: false
          });

        if (crmError) {
          results.errors++;
          results.errorDetails.push(`CRM mapping error: ${crmError.message}`);
          continue;
        }

        results.processed++;
        // Determine if this was a create or update based on lead creation time
        const isNew = new Date(leadData.created_at) > new Date(Date.now() - 5000); // 5 seconds tolerance
        if (isNew) {
          results.created++;
        } else {
          results.updated++;
        }

      } catch (contactError: any) {
        results.errors++;
        results.errorDetails.push(`Contact processing error: ${contactError.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      connectionId,
      integrationId,
      results
    });

  } catch (error: any) {
    console.error('CRM sync error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'CRM sync failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}