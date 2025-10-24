#!/usr/bin/env bash
set -euo pipefail
files=$(grep -RIl "supabaseAdmin" app | grep -v "lib/supabaseServer")
fail=0
for f in $files; do
  if ! grep -q "from '@/lib/supabaseServer'" "$f"; then
    echo "Missing import in: $f"
    fail=1
  fi
done
exit $fail
