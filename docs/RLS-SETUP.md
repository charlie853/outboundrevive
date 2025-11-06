# RLS (Row Level Security) Setup Guide

This guide explains how to apply RLS policies to OutboundRevive for multi-tenant data isolation.

## Overview

RLS policies ensure that users can only access data belonging to their account. This provides an additional layer of security beyond code-level `account_id` scoping.

## Current Status

- ✅ **Code-level isolation:** All queries are scoped by `account_id`
- ⚠️ **RLS policies:** Migration exists but not yet applied
- 📄 **Migration file:** `sql/2025-10-30_rls_expand.sql`

## Tables Covered

The migration applies RLS to:
- `campaigns`
- `campaign_cadence_settings`
- `cadence_runs`
- `tenant_billing` (read-only for users)
- `appointments`
- `account_followup_prefs` (already has RLS from followup_prefs migration)

## Prerequisites

1. **Database connection:** You need your Supabase database connection string
   - Format: `postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres`
   - Find it in: Supabase Dashboard → Project Settings → Database → Connection String

2. **psql CLI tool** (PostgreSQL client)
   - macOS: `brew install postgresql`
   - Linux: `sudo apt-get install postgresql-client`
   - Or use Supabase CLI: `supabase db reset`

## Application Methods

### Method 1: Using the Script (Recommended)

```bash
# Set your database URL
export DATABASE_URL='postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres'

# Run the script
./scripts/apply-rls.sh
```

### Method 2: Using Supabase Dashboard

1. Go to Supabase Dashboard → SQL Editor
2. Open `sql/2025-10-30_rls_expand.sql`
3. Copy the entire contents
4. Paste into SQL Editor
5. Click "Run"

### Method 3: Using Supabase CLI

```bash
# If you have Supabase CLI installed
supabase db push

# Or apply specific migration
psql $(supabase db url) < sql/2025-10-30_rls_expand.sql
```

### Method 4: Direct psql

```bash
psql $DATABASE_URL < sql/2025-10-30_rls_expand.sql
```

## Verification

After applying, verify RLS is working:

### 1. Check Policies Exist

```sql
-- In Supabase SQL Editor
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('campaigns', 'cadence_runs', 'tenant_billing', 'appointments');
```

Should show policies for each table.

### 2. Test with Non-Admin User

```sql
-- Switch to a non-admin role (simulates user)
SET ROLE authenticated;
SET request.jwt.claim.sub = 'user-uuid-here';

-- Try to access data (should only see own account's data)
SELECT * FROM campaigns;
SELECT * FROM tenant_billing;
```

### 3. Run Integration Tests

```bash
npm test tests/isolation.test.ts
```

## How RLS Works

1. **User Authentication:** User logs in via Supabase Auth
2. **JWT Token:** Contains `user_id` and `account_id` in metadata
3. **Policy Check:** Each query checks if `user_data` table has a row matching:
   - `user_id = auth.uid()` (from JWT)
   - `account_id = table.account_id` (from row being accessed)
4. **Access Granted:** If match exists, user can access that row

## Service Role Key

⚠️ **Important:** The service role key (`SUPABASE_SERVICE_ROLE_KEY`) **bypasses RLS**. This is intentional:
- Server-side code uses service role key for admin operations
- Client-side code uses user JWT tokens (enforced by RLS)
- Never expose service role key to client-side code

## Troubleshooting

### "Policy does not exist"
- RLS might not be enabled on the table
- Run: `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`

### "Permission denied"
- Check that `user_data` table has correct mappings
- Verify JWT contains `account_id` in metadata

### "All queries return empty"
- Check that `user_data` table has rows for your test user
- Verify `auth.uid()` matches `user_data.user_id`

## Rolling Back

If you need to disable RLS (not recommended for production):

```sql
-- Disable RLS on specific tables
ALTER TABLE campaigns DISABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_runs DISABLE ROW LEVEL SECURITY;
-- ... etc
```

Or drop policies:

```sql
DROP POLICY IF EXISTS campaigns_rls ON campaigns;
DROP POLICY IF EXISTS cadence_runs_rls ON cadence_runs;
-- ... etc
```

## Next Steps

After applying RLS:

1. ✅ Verify policies are working
2. ✅ Test with real user accounts
3. ✅ Run integration tests
4. ✅ Document any issues found
5. ✅ Update audit report

## Related Files

- `sql/2025-10-30_rls_expand.sql` - RLS migration
- `sql/rls_policies.sql` - Original RLS setup (if exists)
- `tests/isolation.test.ts` - Integration tests for RLS
- `docs/test-audit.md` - Audit report mentioning RLS status

