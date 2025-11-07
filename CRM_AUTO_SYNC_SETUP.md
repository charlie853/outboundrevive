# CRM Auto-Sync Setup

This guide explains how the automatic CRM synchronization works and how to configure it.

## Features Implemented

### 1. Auto-sync after CRM Connection ✅
When you connect a CRM (HubSpot, Salesforce, etc.), the system automatically:
- Pulls all contacts from your CRM
- Syncs them into the `leads` table
- Makes them visible in the "Recent Threads" section within ~3 seconds

### 2. Manual "Refresh CRM" Button ✅
Located on the dashboard between "Connect CRM" and "AI Texter":
- Click to manually sync CRM contacts anytime
- Shows sync progress and results
- Updates the Recent Threads section immediately after sync

### 3. Hourly Auto-Sync via Cron Job ✅
A background job runs every hour to:
- Check all active CRM connections
- Sync any new or updated contacts
- Update contact information (status, owner, notes, etc.)

## Configuration

### Environment Variable (Required for Cron)

To secure the cron endpoint, set a `CRON_SECRET` environment variable:

```bash
# Generate a random secret
openssl rand -base64 32

# Add to Vercel environment variables:
CRON_SECRET=your-generated-secret-here
```

**In Vercel Dashboard:**
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add `CRON_SECRET` with a random value
4. Redeploy the project

### Cron Schedule

The cron job is configured in `vercel.json`:

```json
{
  "path": "/api/cron/sync-crm",
  "schedule": "0 * * * *"  // Every hour at minute 0
}
```

**To change the frequency:**
- `0 * * * *` - Every hour (default)
- `0 */2 * * *` - Every 2 hours
- `0 */6 * * *` - Every 6 hours
- `0 0 * * *` - Once per day at midnight

## How It Works

### Data Flow

1. **CRM Connection** (`/api/crm/connect`)
   - User connects their CRM via Nango OAuth
   - Connection details saved to `crm_connections` table
   - Background sync triggered immediately via `queueMicrotask()`

2. **Sync Service** (`lib/crm/sync-service.ts`)
   - Fetches contacts from CRM via adapter (HubSpot, Salesforce, etc.)
   - Normalizes phone numbers to E.164 format
   - Deduplicates by CRM ID, phone, or email
   - Updates or creates leads in `leads` table

3. **CRM Metadata Stored**
   - `crm_owner` - Sales rep/owner name
   - `crm_owner_email` - Owner's email
   - `crm_status` - Lead status (new, open, won, lost, etc.)
   - `crm_stage` - Pipeline stage
   - `crm_description` - Notes/description
   - `crm_last_activity_at` - Last activity timestamp

4. **Hourly Cron** (`/api/cron/sync-crm`)
   - Vercel triggers the endpoint every hour
   - Loops through all active CRM connections
   - Syncs each account independently
   - Logs results for monitoring

### Sync Strategy

The system uses **"append" strategy** for automatic syncs:
- **New contacts** → Created in `leads` table
- **Existing contacts** → Updated with latest CRM data
- **Manual leads** → Preserved (not deleted)
- **Duplicates** → Avoided using CRM ID + phone matching

## Monitoring

Check sync logs in Vercel:

```bash
vercel logs --since=1h
```

Look for:
- `[cron/sync-crm]` - Hourly cron job logs
- `✅ Initial CRM sync completed` - Post-connection sync
- `✅ Synced` - Successful sync with stats

## Troubleshooting

### Contacts not appearing after connection
1. Check browser console for errors
2. Wait 3-5 seconds and click "Refresh CRM"
3. Check Vercel logs for sync errors

### Cron job not running
1. Verify `CRON_SECRET` is set in Vercel
2. Check Vercel cron logs: Project → Deployments → Cron Jobs
3. Ensure `vercel.json` is committed

### Sync fails with "No access token"
1. Reconnect your CRM (it may have expired)
2. Check `crm_connections` table has `is_active = true`
3. Verify Nango connection is still valid

## API Endpoints

- `POST /api/crm/connect` - Save CRM connection + trigger initial sync
- `POST /api/crm/sync` - Manual sync (used by "Refresh CRM" button)
- `GET /api/cron/sync-crm` - Hourly cron job (secured by `CRON_SECRET`)
- `GET /api/crm/status` - Check CRM connection status

## Next Steps

Once deployed, you can:
1. Connect your CRM and verify contacts appear
2. Test the "Refresh CRM" button
3. Wait an hour and check cron logs to confirm automatic syncs
4. Customize the cron frequency if needed

---

**Questions?** Check the Vercel logs or the code in:
- `/app/api/cron/sync-crm/route.ts`
- `/lib/crm/sync-service.ts`
- `/app/components/RefreshCrmButton.tsx`

