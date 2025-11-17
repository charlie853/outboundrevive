#!/bin/bash

echo "🔍 Checking Vercel logs for recent calendar webhook activity..."
echo "=================================================="
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not installed. Install with: npm install -g vercel"
    exit 1
fi

echo "📋 Streaming recent production logs (filtering for calendar keywords):"
echo ""
vercel logs outboundrevive.com 2>/dev/null | grep -Ei "calcom|calendar|webhook|Looking for lead" --color=always

echo ""
echo "=================================================="
echo ""
echo "💡 Tip: run 'vercel logs outboundrevive.com' to watch live output (Ctrl+C to stop)"
echo ""
echo "🔎 What to look for:"
echo "  - '[calcom] Webhook received' → Shows trigger, phone/email, etc."
echo "  - '[calcom] No matching lead found' → Lead doesn't exist with that phone/email"
echo "  - '[calcom] Appointment processed successfully' → Stored correctly"
echo ""
echo "📊 If you see 'unmatched', the lead's phone/email doesn't match what Cal.com sent."

