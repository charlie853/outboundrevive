# CRM Auto-Sync Testing Guide

## **Overview**
The CRM auto-sync cron job runs **every hour** on Vercel to automatically sync CRM contacts for all connected accounts.

- **Schedule**: `0 * * * *` (every hour at minute 0)
- **Endpoint**: `/api/cron/sync-crm`
- **Method**: GET
- **Auth**: Bearer token with `CRON_SECRET`

---

## **🧪 How to Test**

### **Method 1: Use the Test Script** ⭐ (Recommended)

We've created a test script that simulates the cron job:

```bash
# Test production
./test-crm-auto-sync.sh prod

# Test local (requires dev server running)
./test-crm-auto-sync.sh
```

**What it does**:
- ✅ Loads `CRON_SECRET` from your environment or `.env.local`
- ✅ Calls the `/api/cron/sync-crm` endpoint
- ✅ Shows the full response with status code
- ✅ Pretty-prints JSON output

**Example Output**:
```
🧪 Testing CRM Auto-Sync Cron Job
==================================

✅ CRON_SECRET found: 9eb24ad1be...

🌐 Testing PRODUCTION: https://www.outboundrevive.com

📡 Calling /api/cron/sync-crm...

📊 Response Status: 200

✅ SUCCESS! Cron job executed successfully

📄 Response Body:
{
  "success": true,
  "synced": 2,
  "failed": 0,
  "total": 2,
  "results": [
    {
      "accountId": "11111111-1111-1111-1111-111111111111",
      "provider": "hubspot",
      "success": true,
      "result": {
        "created": 3,
        "updated": 12,
        "skipped": 5
      }
    }
  ]
}
```

---

### **Method 2: Manual cURL**

If you prefer to test manually:

```bash
# Get your CRON_SECRET from Vercel
export CRON_SECRET="your-cron-secret-here"

# Test production
curl -X GET "https://www.outboundrevive.com/api/cron/sync-crm" \
  -H "Authorization: Bearer $CRON_SECRET" \
  | jq

# Test local (requires dev server running)
curl -X GET "http://localhost:3000/api/cron/sync-crm" \
  -H "Authorization: Bearer $CRON_SECRET" \
  | jq
```

---

### **Method 3: Check Vercel Logs**

To see real cron executions in production:

```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# View live logs
vercel logs --follow

# Or view in Vercel Dashboard
# https://vercel.com/your-team/outboundrevive/logs
```

**What to look for**:
```
[cron/sync-crm] Starting hourly CRM sync for all accounts
[cron/sync-crm] Found 2 active connections
[cron/sync-crm] Syncing account 11111111-1111-1111-1111-111111111111 (hubspot)
[cron/sync-crm] ✅ Synced 11111111-1111-1111-1111-111111111111: { created: 3, updated: 12, skipped: 5 }
[cron/sync-crm] Completed. Success: 2, Errors: 0
```

---

## **📊 Understanding the Response**

### **Success Response** (200):
```json
{
  "success": true,
  "synced": 2,        // Number of accounts synced successfully
  "failed": 0,        // Number of accounts that failed
  "total": 2,         // Total active CRM connections
  "results": [
    {
      "accountId": "...",
      "provider": "hubspot",
      "success": true,
      "result": {
        "created": 3,   // New contacts added
        "updated": 12,  // Existing contacts updated
        "skipped": 5    // Contacts without phone numbers
      }
    }
  ]
}
```

### **No Connections** (200):
```json
{
  "success": true,
  "message": "No active connections to sync",
  "synced": 0
}
```

### **Unauthorized** (401):
```json
{
  "error": "Unauthorized",
  "hint": "Cron secret mismatch",
  "hasSecret": true
}
```

---

## **🔍 Debugging**

### **Problem: "Unauthorized" Error**

**Possible causes**:
1. `CRON_SECRET` not set in Vercel environment variables
2. `CRON_SECRET` in your local test doesn't match Vercel
3. Missing `Authorization` header

**Solution**:
```bash
# Check Vercel environment variables
vercel env ls

# Pull latest env vars
vercel env pull

# Verify your local CRON_SECRET matches
grep CRON_SECRET .env.local
```

---

### **Problem: "No active connections to sync"**

**Possible causes**:
1. No CRM is connected
2. CRM connection is marked as `is_active = false`

**Solution**:
1. Connect a CRM in the dashboard
2. Check database:
```sql
SELECT account_id, provider, is_active, last_synced_at 
FROM crm_connections 
WHERE is_active = true;
```

---

### **Problem: Sync succeeds but no leads appear**

**Possible causes**:
1. CRM contacts don't have phone numbers
2. Phone numbers are invalid/non-E164 format

**Solution**:
- Check the cron logs for `[sync-service] Skipping contact without phone`
- Ensure CRM contacts have valid phone numbers in E164 format (+1234567890)

---

## **⏰ Cron Schedule**

The cron job runs **every hour** at the top of the hour:

| Time (UTC) | Time (EST) | Time (PST) |
|------------|------------|------------|
| 00:00      | 7:00 PM    | 4:00 PM    |
| 01:00      | 8:00 PM    | 5:00 PM    |
| 02:00      | 9:00 PM    | 6:00 PM    |
| ...        | ...        | ...        |
| 23:00      | 6:00 PM    | 3:00 PM    |

**Next Execution**:
- Check the "Last synced" timestamp in your dashboard
- The cron will run at the next hour mark (e.g., if it's 3:27 PM, next run is 4:00 PM)

---

## **✅ Verification Checklist**

After connecting a CRM, verify auto-sync is working:

- [ ] **Dashboard shows "Last synced: X minutes ago"**
- [ ] **Timestamp updates automatically every hour**
- [ ] **New CRM contacts appear in "Recent Threads"**
- [ ] **Vercel logs show successful cron execution**
- [ ] **Test script returns success (200)**

---

## **🔗 Related Files**

- **Cron Job**: `app/api/cron/sync-crm/route.ts`
- **Sync Logic**: `lib/crm/sync-service.ts`
- **Test Script**: `test-crm-auto-sync.sh`
- **Cron Config**: `vercel.json`

---

## **📝 Notes**

- The cron job uses the **service role** (supabaseAdmin) so it doesn't need user authentication
- It syncs **all active connections** in the database, not just one account
- Each account is synced independently - if one fails, others still proceed
- The `last_synced_at` timestamp in `crm_connections` is updated after each sync
- Failed syncs are logged but don't stop the cron job

---

**Status**: ✅ Configured and Active  
**Last Updated**: November 13, 2025

