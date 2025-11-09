import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { executeCrmSync } from '@/lib/crm/sync-service';
import { CRMProvider } from '@/lib/crm/types';

/**
 * Cron job to sync CRM contacts hourly for all active connections
 * Set up in Vercel: https://vercel.com/docs/cron-jobs
 * Schedule: 0 * * * * (every hour at minute 0)
 */
export async function GET(req: NextRequest) {
  try {
    // Verify this is coming from Vercel Cron
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn('[cron/sync-crm] Unauthorized request');
      return NextResponse.json(
        {
          error: 'Unauthorized',
          hint: 'Cron secret mismatch',
          hasSecret: true,
        },
        { status: 401 }
      );
    }

    if (!cronSecret) {
      console.warn('[cron/sync-crm] CRON_SECRET is not configured');
      return NextResponse.json(
        {
          error: 'Unauthorized',
          hint: 'CRON_SECRET not configured in environment',
          hasSecret: false,
        },
        { status: 401 }
      );
    }

    console.log('[cron/sync-crm] Starting hourly CRM sync for all accounts');

    // Get all active CRM connections
    const { data: connections, error: connectionsError } = await supabaseAdmin
      .from('crm_connections')
      .select('account_id, provider, nango_connection_id, last_synced_at')
      .eq('is_active', true)
      .order('last_synced_at', { ascending: true, nullsFirst: true });

    if (connectionsError) {
      console.error('[cron/sync-crm] Error fetching connections:', connectionsError);
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
    }

    if (!connections || connections.length === 0) {
      console.log('[cron/sync-crm] No active CRM connections found');
      return NextResponse.json({ 
        success: true, 
        message: 'No active connections to sync',
        synced: 0 
      });
    }

    console.log(`[cron/sync-crm] Found ${connections.length} active connections`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Sync each connection
    for (const conn of connections) {
      try {
        console.log(`[cron/sync-crm] Syncing account ${conn.account_id} (${conn.provider})`);
        
        const { result } = await executeCrmSync({
          accountId: conn.account_id,
          provider: conn.provider as CRMProvider,
          connectionId: conn.nango_connection_id,
          strategy: 'append', // Always append for auto-syncs
        });

        successCount++;
        results.push({
          accountId: conn.account_id,
          provider: conn.provider,
          success: true,
          result,
        });

        console.log(`[cron/sync-crm] ✅ Synced ${conn.account_id}:`, {
          created: result?.created,
          updated: result?.updated,
          skipped: result?.skipped,
        });
      } catch (error: any) {
        errorCount++;
        console.error(`[cron/sync-crm] ❌ Failed to sync ${conn.account_id}:`, error);
        results.push({
          accountId: conn.account_id,
          provider: conn.provider,
          success: false,
          error: error?.message || 'Unknown error',
        });
      }
    }

    console.log(`[cron/sync-crm] Completed. Success: ${successCount}, Errors: ${errorCount}`);

    return NextResponse.json({
      success: true,
      synced: successCount,
      failed: errorCount,
      total: connections.length,
      results,
    });
  } catch (error: any) {
    console.error('[cron/sync-crm] Unexpected error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

