# Nango CRM Integration Setup Guide

This document explains how to configure Nango for CRM OAuth integrations in OutboundRevive.

---

## Overview

OutboundRevive uses [Nango](https://www.nango.dev/) to handle OAuth flows for CRM integrations. Nango provides a unified interface for connecting to multiple CRMs (HubSpot, Salesforce, Zoho CRM) without managing OAuth flows directly.

---

## Required Environment Variables

Add these to your Vercel project (or `.env.local` for local development):

### **Required:**
- `NANGO_SECRET_KEY` - Your Nango secret key (from Nango dashboard)
- `NEXT_PUBLIC_NANGO_PUBLIC_KEY` - Your Nango public key (from Nango dashboard)
- `NEXT_PUBLIC_NANGO_HOST` - Nango API host (default: `https://api.nango.dev`)

### **Optional (for GoHighLevel direct OAuth):**
- `GOHIGHLEVEL_CLIENT_ID` - GoHighLevel OAuth client ID
- `GOHIGHLEVEL_CLIENT_SECRET` - GoHighLevel OAuth client secret

---

## Nango Dashboard Configuration

### 1. **Create Nango Account**
1. Sign up at https://www.nango.dev/
2. Create a new project
3. Copy your **Secret Key** and **Public Key** from the dashboard

### 2. **Add CRM Integrations**

For each CRM you want to support, add an integration in Nango:

#### **HubSpot**
- **Integration Name**: `hubspot`
- **Provider**: HubSpot
- **OAuth Type**: OAuth2
- **Scopes**: `contacts.read`, `contacts.write` (or as needed)
- **Redirect URL**: `https://api.nango.dev/oauth/callback` (Nango handles this)

#### **Salesforce**
- **Integration Name**: `salesforce`
- **Provider**: Salesforce
- **OAuth Type**: OAuth2
- **Scopes**: `api`, `refresh_token`, `offline_access`
- **Redirect URL**: `https://api.nango.dev/oauth/callback`

#### **Zoho CRM**
- **Integration Name**: `zoho-crm`
- **Provider**: Zoho CRM
- **OAuth Type**: OAuth2
- **Scopes**: `ZohoCRM.modules.contacts.READ`, `ZohoCRM.modules.contacts.WRITE`
- **Redirect URL**: `https://api.nango.dev/oauth/callback`

### 3. **Configure CRM OAuth Apps**

For each CRM, you'll need to create an OAuth app in the CRM's developer portal:

#### **HubSpot**
1. Go to https://app.hubspot.com/developers
2. Create a new app
3. Enable "Contacts" scopes
4. Add **Authorized Redirect URI**: `https://api.nango.dev/oauth/callback`
5. Copy **Client ID** and **Client Secret**
6. Add these to Nango integration config

#### **Salesforce**
1. Go to https://login.salesforce.com/app/mgmt/force/force.apexp?setupid=ConnectedApplications
2. Create a new Connected App
3. Enable OAuth Settings
4. Add **Callback URL**: `https://api.nango.dev/oauth/callback`
5. Select scopes: `Access and manage your data (api)`, `Perform requests on your behalf at any time (refresh_token, offline_access)`
6. Copy **Consumer Key** (Client ID) and **Consumer Secret** (Client Secret)
7. Add these to Nango integration config

#### **Zoho CRM**
1. Go to https://api-console.zoho.com/
2. Create a new Server-based Application
3. Add **Redirect URI**: `https://api.nango.dev/oauth/callback`
4. Select scopes: `ZohoCRM.modules.contacts.READ`, `ZohoCRM.modules.contacts.WRITE`
5. Copy **Client ID** and **Client Secret**
6. Add these to Nango integration config

---

## Vercel Environment Variables Setup

### **Using Vercel CLI:**
```bash
# Set Nango keys
npx vercel env add NANGO_SECRET_KEY production
npx vercel env add NEXT_PUBLIC_NANGO_PUBLIC_KEY production
npx vercel env add NEXT_PUBLIC_NANGO_HOST production

# Optional: GoHighLevel (if using direct OAuth)
npx vercel env add GOHIGHLEVEL_CLIENT_ID production
npx vercel env add GOHIGHLEVEL_CLIENT_SECRET production
```

### **Using Vercel Dashboard:**
1. Go to your project → Settings → Environment Variables
2. Add each variable for **Production**, **Preview**, and **Development** environments
3. Redeploy after adding variables

---

## Testing the Integration

### **Manual Test Checklist:**

1. **Check Environment Variables**
   ```bash
   # In browser console on your app
   console.log('Nango Public Key:', process.env.NEXT_PUBLIC_NANGO_PUBLIC_KEY);
   ```

2. **Test Connect Flow**
   - Navigate to Dashboard or Settings
   - Click "Connect CRM" button
   - Popup should open (not blank)
   - Select a CRM (HubSpot, Salesforce, or Zoho)
   - Complete OAuth flow
   - Should see "Connected to [CRM]" message

3. **Verify Connection Saved**
   - Check `crm_connections` table in Supabase:
   ```sql
   SELECT * FROM crm_connections WHERE is_active = true;
   ```
   - Should see a row with your account_id and provider

4. **Test Sync**
   - Click "Sync Contacts" button
   - Should show preview of contacts
   - Confirm sync creates/updates leads

---

## Troubleshooting

### **Empty Popup**
- **Cause**: Missing `NEXT_PUBLIC_NANGO_PUBLIC_KEY` or `NEXT_PUBLIC_NANGO_HOST`
- **Fix**: Add environment variables and redeploy

### **"Failed to get session token"**
- **Cause**: Missing `NANGO_SECRET_KEY` or invalid key
- **Fix**: Verify secret key in Nango dashboard and Vercel env vars

### **"Connection not found" after OAuth**
- **Cause**: Integration not configured in Nango or wrong `providerConfigKey`
- **Fix**: Verify integration name matches exactly (e.g., `hubspot`, not `hubspot-crm`)

### **OAuth Redirect Error**
- **Cause**: Redirect URI mismatch between CRM app and Nango
- **Fix**: Ensure CRM OAuth app has `https://api.nango.dev/oauth/callback` as redirect URI

---

## Integration Names Reference

The following `providerConfigKey` values are used in the codebase:

- `hubspot` - HubSpot CRM
- `salesforce` - Salesforce
- `zoho-crm` - Zoho CRM
- `gohighlevel` - GoHighLevel (uses direct OAuth, not Nango)

**Important**: These must match exactly with the integration names in your Nango dashboard.

---

## GoHighLevel (Direct OAuth)

GoHighLevel is not supported by Nango, so we use direct OAuth:

1. Create OAuth app at https://marketplace.gohighlevel.com/
2. Set redirect URI: `{PUBLIC_BASE_URL}/api/oauth/gohighlevel/callback`
3. Add `GOHIGHLEVEL_CLIENT_ID` and `GOHIGHLEVEL_CLIENT_SECRET` to env vars
4. Use `ConnectGHLButton` component instead of `ConnectCrmButton`

---

## Support

If you encounter issues:
1. Check browser console for errors
2. Check Vercel function logs for API errors
3. Verify all environment variables are set
4. Verify Nango integrations are configured correctly
5. Check Supabase `crm_connections` table for saved connections

---

**Last Updated**: 2025-01-XX

