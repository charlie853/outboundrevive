#!/bin/bash

echo "🔍 Checking Vercel logs for recent Calendly webhook activity..."
echo "=================================================="
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not installed. Install with: npm i -g vercel"
    exit 1
fi

echo "📋 Last 50 logs from production (filtering for 'calendly' keyword):"
echo ""
vercel logs --prod --follow=false -n 50 2>/dev/null | grep -i "calendly\|webhook\|appointment\|Looking for lead" --color=always

echo ""
echo "=================================================="
echo ""
echo "💡 To see live logs, run: vercel logs --prod --follow"
echo ""
echo "🔎 What to look for:"
echo "  - '[calendly] Looking for lead:' → Shows what phone/email webhook is searching for"
echo "  - '[calendly] Phone lookup result:' → Did it find the lead?"
echo "  - '[calendly] ⚠️ No matching lead found' → Lead doesn't exist with that phone/email"
echo "  - '[calendly] ✅ Lead found, creating appointment' → Success!"
echo ""
echo "📊 If you see 'unmatched', the lead's phone format in your database"
echo "    doesn't match what Calendly sent (likely E.164 normalization issue)."

