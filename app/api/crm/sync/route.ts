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

    // Get user's CRM connection
    const { data: userData, error: userError } = await supabaseAdmin
      .from('user_data')
      .select('nango_token, crm')
      .eq('user_id', user.id)
      .single();

    if (userError || !userData?.nango_token || !userData?.crm) {
      return NextResponse.json({ error: 'No CRM connection found' }, { status: 400 });
    }

    const accountId = await getCurrentUserAccountId();
    if (!accountId) {
      return NextResponse.json({ error: 'No account found' }, { status: 400 });
    }

    // Create CRM adapter and sync
    const adapter = createCRMAdapter(userData.crm as CRMProvider);
    const contacts = await adapter.syncContacts(userData.nango_token, strategy);

    // If preview, return contacts directly
    if (strategy === 'preview') {
      return NextResponse.json({
        success: true,
        contacts: contacts,
      });
    }

    // For actual sync, process contacts into leads
    const syncResult = await processContactsToLeads(contacts, accountId, strategy);

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
  strategy: SyncStrategy
): Promise<SyncResult> {
  try {
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

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
        // Check if lead already exists (by phone or email)
        const { data: existingLead } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('account_id', accountId)
          .or(`phone.eq.${contact.phone}${contact.email ? `,email.eq.${contact.email}` : ''}`)
          .single();

        const leadData = {
          name: contact.name,
          phone: contact.phone,
          email: contact.email || null,
          account_id: accountId,
          status: 'pending',
          created_at: new Date().toISOString(),
        };

        if (existingLead) {
          // Update existing lead
          await supabaseAdmin
            .from('leads')
            .update(leadData)
            .eq('id', existingLead.id);
          updated++;
        } else {
          // Create new lead
          await supabaseAdmin
            .from('leads')
            .insert(leadData);
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