#!/bin/bash
# Setup Nango environment variables in Vercel
# Usage: ./scripts/setup_nango_env.sh

set -e

echo "Setting up Nango environment variables in Vercel..."
echo ""
echo "You'll need:"
echo "  1. NANGO_SECRET_KEY (from Nango dashboard - Settings → Secret Key)"
echo "  2. NEXT_PUBLIC_NANGO_PUBLIC_KEY (from Nango dashboard - Settings → Public Key)"
echo "  3. NANGO_HOST (usually https://api.nango.dev)"
echo ""

read -p "Enter NANGO_SECRET_KEY: " NANGO_SECRET_KEY
read -p "Enter NEXT_PUBLIC_NANGO_PUBLIC_KEY (starts with pk_): " NEXT_PUBLIC_NANGO_PUBLIC_KEY
read -p "Enter NANGO_HOST [https://api.nango.dev]: " NANGO_HOST
NANGO_HOST=${NANGO_HOST:-https://api.nango.dev}

echo ""
echo "Setting environment variables..."

# Secret key (server-side only)
echo "$NANGO_SECRET_KEY" | npx vercel env add NANGO_SECRET_KEY production
echo "$NANGO_SECRET_KEY" | npx vercel env add NANGO_SECRET_KEY preview
echo "$NANGO_SECRET_KEY" | npx vercel env add NANGO_SECRET_KEY development

# Public key (client-side, safe to expose)
echo "$NEXT_PUBLIC_NANGO_PUBLIC_KEY" | npx vercel env add NEXT_PUBLIC_NANGO_PUBLIC_KEY production
echo "$NEXT_PUBLIC_NANGO_PUBLIC_KEY" | npx vercel env add NEXT_PUBLIC_NANGO_PUBLIC_KEY preview
echo "$NEXT_PUBLIC_NANGO_PUBLIC_KEY" | npx vercel env add NEXT_PUBLIC_NANGO_PUBLIC_KEY development

# Host (both server and client)
echo "$NANGO_HOST" | npx vercel env add NANGO_HOST production
echo "$NANGO_HOST" | npx vercel env add NANGO_HOST preview
echo "$NANGO_HOST" | npx vercel env add NANGO_HOST development

echo "$NANGO_HOST" | npx vercel env add NEXT_PUBLIC_NANGO_HOST production
echo "$NANGO_HOST" | npx vercel env add NEXT_PUBLIC_NANGO_HOST preview
echo "$NANGO_HOST" | npx vercel env add NEXT_PUBLIC_NANGO_HOST development

echo ""
echo "✅ All Nango environment variables added!"
echo ""
echo "⚠️  IMPORTANT: You need to redeploy for the changes to take effect:"
echo "   npx vercel --prod"
echo ""
echo "Or trigger a new deployment from the Vercel dashboard."

