# How to Apply RLS Migration

Since you don't have `psql` or Supabase CLI installed, here's how to apply the RLS migration using the **Supabase Dashboard** (easiest method):

## Step 1: Open Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your project
3. Click on **"SQL Editor"** in the left sidebar

## Step 2: Open the Migration File

1. In your code editor, open: `sql/2025-10-30_rls_expand.sql`
2. Copy the **entire contents** of the file

## Step 3: Run the Migration

1. In Supabase SQL Editor, paste the copied SQL
2. Click **"Run"** (or press Cmd+Enter / Ctrl+Enter)
3. Wait for it to complete (should show "Success" message)

## Step 4: Verify

In the SQL Editor, run this query to verify policies were created:

```sql
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('campaigns', 'cadence_runs', 'tenant_billing', 'appointments', 'campaign_cadence_settings')
ORDER BY tablename, policyname;
```

You should see 5 policies (one for each table).

## Alternative: Install psql (Optional)

If you want to use the command line later:

```bash
# macOS
brew install postgresql

# Then you can use:
export DATABASE_URL='postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres'
./scripts/apply-rls.sh
```

## What This Migration Does

- Enables RLS on 5 tables:
  - `campaigns`
  - `campaign_cadence_settings`
  - `cadence_runs`
  - `tenant_billing` (read-only for users)
  - `appointments`

- Creates policies that ensure users can only access data from their own account
- Service role key (used by server) bypasses RLS automatically

## After Migration

Once RLS is applied, your data will be isolated by account at the database level, providing an additional security layer beyond code-level `account_id` scoping.

