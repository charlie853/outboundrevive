# RLS Migration - Fixed SQL

## Issue Fixed

Supabase doesn't support `IF NOT EXISTS` in `CREATE POLICY` statements. The migration has been updated to use `DROP POLICY IF EXISTS` followed by `CREATE POLICY`.

## Updated Migration

The file `sql/2025-10-30_rls_expand.sql` has been fixed. It now:

1. Drops existing policies if they exist (safe to run multiple times)
2. Creates the policies fresh

## How to Apply

1. **Open Supabase Dashboard:**
   - Go to https://supabase.com/dashboard
   - Select your project
   - Click **"SQL Editor"**

2. **Copy the fixed SQL:**
   - Open `sql/2025-10-30_rls_expand.sql`
   - Copy the entire file contents

3. **Run in SQL Editor:**
   - Paste into Supabase SQL Editor
   - Click **"Run"**
   - Should complete successfully now

## What Changed

**Before (broken):**
```sql
CREATE POLICY IF NOT EXISTS campaigns_rls ON public.campaigns ...
```

**After (fixed):**
```sql
DROP POLICY IF EXISTS campaigns_rls ON public.campaigns;
CREATE POLICY campaigns_rls ON public.campaigns ...
```

This applies to all 5 policies:
- `campaigns_rls`
- `cadence_settings_rls`
- `cadence_runs_rls`
- `tenant_billing_select_rls`
- `appointments_rls`

## Verification

After running, verify policies exist:

```sql
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename IN ('campaigns', 'cadence_runs', 'tenant_billing', 'appointments', 'campaign_cadence_settings')
ORDER BY tablename;
```

Should show 5 policies.

