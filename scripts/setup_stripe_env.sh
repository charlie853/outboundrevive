#!/bin/bash
# Setup Stripe environment variables in Vercel
# Usage: ./scripts/setup_stripe_env.sh

set -e

echo "Setting up Stripe environment variables in Vercel..."
echo ""
echo "You'll need:"
echo "  1. STRIPE_SECRET_KEY (from https://dashboard.stripe.com/apikeys)"
echo "  2. STRIPE_WEBHOOK_SECRET (from https://dashboard.stripe.com/webhooks)"
echo "  3. STRIPE_PRICE_LITE (Price ID for Lite plan)"
echo "  4. STRIPE_PRICE_STANDARD (Price ID for Standard plan)"
echo "  5. STRIPE_PRICE_PRO (Price ID for Pro plan)"
echo ""

read -p "Enter STRIPE_SECRET_KEY (starts with sk_): " STRIPE_SECRET_KEY
read -p "Enter STRIPE_WEBHOOK_SECRET (starts with whsec_): " STRIPE_WEBHOOK_SECRET
read -p "Enter STRIPE_PRICE_LITE (price_...): " STRIPE_PRICE_LITE
read -p "Enter STRIPE_PRICE_STANDARD (price_...): " STRIPE_PRICE_STANDARD
read -p "Enter STRIPE_PRICE_PRO (price_...): " STRIPE_PRICE_PRO

echo ""
echo "Setting environment variables..."

npx vercel env add STRIPE_SECRET_KEY production <<< "$STRIPE_SECRET_KEY"
npx vercel env add STRIPE_SECRET_KEY preview <<< "$STRIPE_SECRET_KEY"
npx vercel env add STRIPE_SECRET_KEY development <<< "$STRIPE_SECRET_KEY"

npx vercel env add STRIPE_WEBHOOK_SECRET production <<< "$STRIPE_WEBHOOK_SECRET"
npx vercel env add STRIPE_WEBHOOK_SECRET preview <<< "$STRIPE_WEBHOOK_SECRET"
npx vercel env add STRIPE_WEBHOOK_SECRET development <<< "$STRIPE_WEBHOOK_SECRET"

npx vercel env add STRIPE_PRICE_LITE production <<< "$STRIPE_PRICE_LITE"
npx vercel env add STRIPE_PRICE_LITE preview <<< "$STRIPE_PRICE_LITE"
npx vercel env add STRIPE_PRICE_LITE development <<< "$STRIPE_PRICE_LITE"

npx vercel env add STRIPE_PRICE_STANDARD production <<< "$STRIPE_PRICE_STANDARD"
npx vercel env add STRIPE_PRICE_STANDARD preview <<< "$STRIPE_PRICE_STANDARD"
npx vercel env add STRIPE_PRICE_STANDARD development <<< "$STRIPE_PRICE_STANDARD"

npx vercel env add STRIPE_PRICE_PRO production <<< "$STRIPE_PRICE_PRO"
npx vercel env add STRIPE_PRICE_PRO preview <<< "$STRIPE_PRICE_PRO"
npx vercel env add STRIPE_PRICE_PRO development <<< "$STRIPE_PRICE_PRO"

echo ""
echo "✅ All Stripe environment variables set!"
echo ""
echo "Note: You'll need to redeploy your project for these to take effect."
echo "Run: npx vercel --prod"

