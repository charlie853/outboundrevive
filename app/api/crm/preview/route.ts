import { NextRequest, NextResponse } from 'next/server';
import { requireAccountAccess } from '@/lib/account';
import { Nango } from '@nangohq/node';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });

export async function POST(req: NextRequest) {
  try {
    // Check authentication and get account ID
    const accountId = await requireAccountAccess();
    if (!accountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { connectionId, integrationId } = await req.json();

    if (!connectionId || !integrationId) {
      return NextResponse.json(
        { error: 'connectionId and integrationId are required' },
        { status: 400 }
      );
    }

    console.log(`Previewing CRM contacts for connection ${connectionId} (${integrationId})`);

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
    } else if (integrationId === 'gohighlevel') {
      endpoint = '/contacts';
    }

    // Fetch contacts from CRM via Nango
    let contacts;
    try {
      contacts = await nango.get({
        providerConfigKey: integrationId,
        connectionId: connectionId,
        endpoint: endpoint,
      });
    } catch (nangoError: any) {
      console.error('Nango API error during preview:', nangoError);
      
      if (nangoError.response?.status === 404) {
        throw new Error(`Endpoint not found: ${endpoint}. The ${integrationId} integration may not be properly configured.`);
      }
      
      throw new Error(`Failed to preview contacts from ${integrationId}: ${nangoError.message}`);
    }

    // Handle different response structures
    let contactsArray: any[] = [];
    if (integrationId === 'hubspot') {
      contactsArray = contacts.data?.results || contacts.data || [];
    } else if (integrationId === 'salesforce') {
      contactsArray = contacts.data?.records || contacts.data || [];
    } else if (integrationId === 'pipedrive') {
      contactsArray = contacts.data?.data || contacts.data || [];
    } else if (integrationId === 'zoho') {
      contactsArray = contacts.data?.data || contacts.data || [];
    } else if (integrationId === 'gohighlevel') {
      contactsArray = contacts.data?.contacts || contacts.data || [];
    } else {
      contactsArray = contacts.data || [];
    }

    // Count contacts with valid phone numbers
    let validContacts = 0;
    let totalContacts = contactsArray.length;

    for (const contact of contactsArray) {
      console.log(contact);
      let phone = '';
      
      // Extract phone based on provider
      if (integrationId === 'hubspot') {
        phone = contact.properties?.phone || '';
      } else if (integrationId === 'salesforce') {
        phone = contact.Phone || contact.MobilePhone || '';
      } else if (integrationId === 'pipedrive') {
        phone = contact.phone?.[0]?.value || contact.phone || '';
      } else if (integrationId === 'zoho') {
        phone = contact.Phone || contact.Mobile || '';
      } else if (integrationId === 'gohighlevel') {
        phone = contact.phone || '';
      } else {
        phone = contact.phone || contact.mobile || '';
      }

      // Check if phone can be normalized
      if (phone && phone.toString().trim()) {
        const digits = phone.toString().replace(/\D/g, '');
        if (digits.length >= 10) {
          validContacts++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      connectionId,
      integrationId,
      preview: {
        totalContacts,
        validContacts,
        invalidContacts: totalContacts - validContacts
      }
    });

  } catch (error: any) {
    console.error('CRM preview error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'CRM preview failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
