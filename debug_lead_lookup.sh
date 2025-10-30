#!/bin/bash
# Debug: check if lead exists and account_id matches

PHONE="+12062959002"
LEAD_ID="4e4023ed-6d80-41b1-8b1d-8d5c53c05565"  # From resend-initial output

echo "Checking lead in database..."
echo "Phone: $PHONE"
echo "Expected Lead ID: $LEAD_ID"
echo ""

# Check production logs for the last inbound webhook call
echo "Recent webhook logs should show:"
echo "- 'No lead found for phone' if lookup failed"
echo "- Lead details if lookup succeeded"
echo ""
echo "Try checking Vercel logs at:"
echo "https://vercel.com/charlie853s-projects/outboundrevive/logs"
