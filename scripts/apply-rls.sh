#!/bin/bash
# Apply RLS policies migration to Supabase
# 
# Usage:
#   ./scripts/apply-rls.sh
#   or
#   psql $DATABASE_URL < sql/2025-10-30_rls_expand.sql

set -e

echo "🔒 Applying RLS Policies Migration"
echo "===================================="

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ Error: DATABASE_URL environment variable is not set"
  echo ""
  echo "Set it with:"
  echo "  export DATABASE_URL='postgresql://user:password@host:port/database'"
  echo ""
  echo "Or use Supabase connection string:"
  echo "  export DATABASE_URL='postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres'"
  exit 1
fi

SQL_FILE="sql/2025-10-30_rls_expand.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "❌ Error: SQL file not found: $SQL_FILE"
  exit 1
fi

echo "📄 Reading SQL from: $SQL_FILE"
echo "🔗 Connecting to: ${DATABASE_URL%%@*}@***"
echo ""

# Apply migration
psql "$DATABASE_URL" < "$SQL_FILE"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ RLS policies applied successfully!"
  echo ""
  echo "Next steps:"
  echo "  1. Verify policies in Supabase dashboard"
  echo "  2. Test with a non-admin user to ensure RLS is working"
  echo "  3. Run integration tests: npm test"
else
  echo ""
  echo "❌ Migration failed. Check the error above."
  exit 1
fi

