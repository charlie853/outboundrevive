# CRM Connect Button Fix - Summary

**Date**: 2025-01-XX  
**Status**: ✅ Complete

---

## Problem

The "Connect CRM" button was showing an empty popup when clicked. The Nango OAuth flow wasn't working because:

1. **Nango client not initialized** - The `Nango` instance was created without required configuration (public key and host)
2. **Session token timing** - Session token was being set after opening the UI, causing the popup to be empty
3. **Missing error handling** - No user feedback when configuration was missing or errors occurred
4. **Status endpoint outdated** - Was checking legacy `user_data` table instead of new `crm_connections` table

---

## Changes Made

### 1. **Fixed Nango Initialization** (`app/components/CRMIntegrations.tsx`)

**Before:**
```typescript
const [nango] = useState(() => new Nango());
```

**After:**
```typescript
const [nango] = useState(() => {
  const publicKey = process.env.NEXT_PUBLIC_NANGO_PUBLIC_KEY;
  const host = process.env.NEXT_PUBLIC_NANGO_HOST || 'https://api.nango.dev';
  
  if (!publicKey) {
    console.error('[CRM] NEXT_PUBLIC_NANGO_PUBLIC_KEY is not set. Nango popup will not work.');
  }
  
  return new Nango({
    publicKey: publicKey || '',
    host: host,
  });
});
```

### 2. **Fixed Connect Flow** (`app/components/CRMIntegrations.tsx`)

**Changes:**
- Get session token **before** opening Connect UI
- Set `sessionToken` immediately when opening UI (not after)
- Added configuration check before attempting connection
- Improved error handling with specific error messages
- Added error event handler for Nango errors
- Better logging for debugging

**Key Fix:**
```typescript
// Get session token FIRST
const tokenResponse = await authenticatedFetch('/api/crm/session-token', {...});
const { sessionToken } = await tokenResponse.json();

// Open UI WITH token immediately
const connect = nango.openConnectUI({
  sessionToken: sessionToken, // ← Set immediately
  onEvent: async (event) => {
    // Handle connect, close, error events
  },
});
```

### 3. **Updated CRM Status Endpoint** (`app/api/crm/status/route.ts`)

**Changes:**
- Now checks `crm_connections` table first (new source of truth)
- Falls back to `user_data` table for backwards compatibility
- Returns `lastSyncedAt` timestamp if available
- Uses `account_id` for multi-tenant scoping

### 4. **Added Documentation** (`docs/NANGO-SETUP.md`)

Created comprehensive setup guide covering:
- Required environment variables
- Nango dashboard configuration
- CRM OAuth app setup (HubSpot, Salesforce, Zoho)
- Vercel environment variable setup
- Testing checklist
- Troubleshooting guide

---

## Required Environment Variables

Add these to Vercel (or `.env.local` for local dev):

### **Required:**
```bash
NANGO_SECRET_KEY=sk_...              # From Nango dashboard
NEXT_PUBLIC_NANGO_HOST=https://api.nango.dev  # Optional, defaults to this
```

**Note:** Public keys are deprecated. Nango now uses session tokens (automatically handled by `/api/crm/session-token`).

### **How to Set in Vercel:**
```bash
npx vercel env add NANGO_SECRET_KEY production
npx vercel env add NEXT_PUBLIC_NANGO_HOST production  # Optional
```

---

## Nango Dashboard Configuration

### 1. **Create Integrations**

In your Nango dashboard, add integrations with these exact names:

- `hubspot` - HubSpot CRM
- `salesforce` - Salesforce
- `zoho-crm` - Zoho CRM

### 2. **Configure Each CRM OAuth App**

For each CRM, create an OAuth app and add these redirect URIs:

**Redirect URI for all CRMs:**
```
https://api.nango.dev/oauth/callback
```

**CRM-specific setup:**
- **HubSpot**: https://app.hubspot.com/developers
- **Salesforce**: https://login.salesforce.com/app/mgmt/force/force.apexp?setupid=ConnectedApplications
- **Zoho CRM**: https://api-console.zoho.com/

See `docs/NANGO-SETUP.md` for detailed instructions.

---

## Testing Checklist

### ✅ **Pre-flight Checks:**
- [ ] Environment variables set in Vercel
- [ ] Nango integrations created in dashboard
- [ ] CRM OAuth apps configured with correct redirect URIs
- [ ] Redeploy after adding env vars

### ✅ **Connect Flow Test:**
1. Navigate to Dashboard or Settings
2. Click "Connect CRM" button
3. **Expected**: Popup opens (not blank) showing CRM selection
4. Select a CRM (e.g., HubSpot)
5. Complete OAuth flow
6. **Expected**: "Connected to [CRM]" message appears
7. **Expected**: Connection saved in `crm_connections` table

### ✅ **Verify Connection:**
```sql
-- Check Supabase
SELECT * FROM crm_connections WHERE is_active = true;
```

Should see a row with:
- `account_id` = your account ID
- `provider` = 'hubspot', 'salesforce', or 'zoho-crm'
- `is_active` = true
- `nango_connection_id` = connection ID from Nango

### ✅ **Sync Test:**
1. Click "Sync Contacts" button
2. **Expected**: Preview modal shows contacts from CRM
3. Choose sync strategy (append/overwrite)
4. **Expected**: Contacts imported to `leads` table

---

## Troubleshooting

### **Empty Popup**
- **Cause**: Missing `NEXT_PUBLIC_NANGO_PUBLIC_KEY`
- **Fix**: Add env var and redeploy

### **"Failed to get session token"**
- **Cause**: Missing `NANGO_SECRET_KEY` or invalid key
- **Fix**: Verify secret key in Nango dashboard matches Vercel env var

### **"Connection not found" after OAuth**
- **Cause**: Integration name mismatch or not configured in Nango
- **Fix**: Verify integration name matches exactly (e.g., `hubspot`, not `hubspot-crm`)

### **OAuth Redirect Error**
- **Cause**: Redirect URI mismatch
- **Fix**: Ensure CRM OAuth app has `https://api.nango.dev/oauth/callback` as redirect URI

---

## Files Changed

1. `app/components/CRMIntegrations.tsx` - Fixed Nango initialization and connect flow
2. `app/api/crm/status/route.ts` - Updated to check `crm_connections` table
3. `docs/NANGO-SETUP.md` - New comprehensive setup guide

---

## Next Steps

1. **Set Environment Variables** in Vercel
2. **Configure Nango Integrations** in dashboard
3. **Set up CRM OAuth Apps** (HubSpot, Salesforce, Zoho)
4. **Test Connect Flow** end-to-end
5. **Verify Connection** in database

---

**Ready for testing** ✅

