#!/bin/bash
set -e

# Resend Initial Text - Admin CLI
# Uses the new /api/admin/leads/resend-initial endpoint

echo "📱 Resending Initial Outreach to Test Leads..."
echo ""

# 0) Pull prod env and export minimal vars
echo "Loading production environment variables..."

if [ ! -f .env.prod ]; then
  echo "❌ Error: .env.prod not found. Run 'npx vercel env pull .env.prod --environment=production' first."
  exit 1
fi

eval "$(
  awk -F= '
    function strip(s){ gsub(/^"/,"",s); gsub(/"$/,"",s); return s }
    /^(PUBLIC_BASE_URL|DEFAULT_ACCOUNT_ID|SUPABASE_SERVICE_ROLE_KEY)=/{
      k=$1; v=substr($0, index($0,$2)); v=strip(v); gsub(/\\/,"\\\\",v); gsub(/"/,"\\\"",v);
      printf("export %s=\"%s\"\n", k, v);
    }' .env.prod
)"

# Validate required vars
if [ -z "$PUBLIC_BASE_URL" ]; then
  echo "❌ Error: PUBLIC_BASE_URL not found in .env.prod"
  exit 1
fi

if [ -z "$DEFAULT_ACCOUNT_ID" ]; then
  echo "❌ Error: DEFAULT_ACCOUNT_ID not found in .env.prod"
  exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in .env.prod"
  exit 1
fi

echo "✅ Environment loaded"
echo "   Base URL: $PUBLIC_BASE_URL"
echo "   Account ID: $DEFAULT_ACCOUNT_ID"
echo ""

# 1) Define the two test phones (already in DB). Normalize to E.164:
export PAUL="+12062959002"   # Paul Anderson (was (206) 295-9002)
export SCOTT="+14152655001"  # Scott McCarthy (was 415/265-5001)

echo "📋 Target leads:"
echo "   Paul Anderson: $PAUL"
echo "   Scott McCarthy: $SCOTT"
echo ""

# 2) Call the new admin endpoint to resend the initial text
echo "🚀 Sending request to admin endpoint..."
echo ""

RESPONSE=$(curl -sS -X POST "$PUBLIC_BASE_URL/api/admin/leads/resend-initial" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data "{\"accountId\":\"$DEFAULT_ACCOUNT_ID\",\"phones\":[\"$PAUL\",\"$SCOTT\"],\"force\":true,\"reason\":\"manual_demo_resend\"}")

# Pretty print the response
if command -v jq &> /dev/null; then
  echo "$RESPONSE" | jq .
else
  echo "$RESPONSE"
fi

echo ""

# Check if successful
if echo "$RESPONSE" | grep -q '"success":true'; then
  echo "✅ Success! Messages sent."
  echo ""
  echo "📱 Paul and Scott should receive the initial outreach text shortly."
  echo "💬 When they reply, your AI bot will automatically respond!"
  echo ""
  echo "👀 Monitor responses at: $PUBLIC_BASE_URL/dashboard"
else
  echo "⚠️  Request completed but check the response above for details."
fi

