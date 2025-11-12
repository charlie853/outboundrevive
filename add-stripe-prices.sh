#!/bin/bash

# Add Stripe Price IDs to Vercel
# Run this script: bash add-stripe-prices.sh

echo "🔧 Adding Stripe Price IDs to Vercel..."
echo ""

# Lite Plan
echo "Adding STRIPE_PRICE_LITE..."
vercel env add STRIPE_PRICE_LITE production preview development <<EOF
price_1SO4AAHiHOusgnRTbmiYHkPY
EOF

echo ""

# Standard Plan
echo "Adding STRIPE_PRICE_STANDARD..."
vercel env add STRIPE_PRICE_STANDARD production preview development <<EOF
price_1SO4AZHiHOusgnRTBkpZ5PBC
EOF

echo ""

# Pro Plan
echo "Adding STRIPE_PRICE_PRO..."
vercel env add STRIPE_PRICE_PRO production preview development <<EOF
price_1SO4AsHiHOusgnRTNfh3nLRK
EOF

echo ""
echo "✅ Done! All Stripe Price IDs added to Vercel."
echo ""
echo "Next steps:"
echo "1. Go to Vercel Dashboard to verify: https://vercel.com"
echo "2. Redeploy your project or wait for auto-deploy"
echo "3. Test the pricing page upgrade flow"

