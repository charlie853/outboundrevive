#!/usr/bin/env node

/**
 * Stripe Configuration Test Script
 * 
 * This script validates your Stripe setup and helps diagnose connection issues.
 * 
 * Usage:
 *   node scripts/test-stripe.mjs
 */

import Stripe from 'stripe';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
try {
  const envPath = join(__dirname, '..', '.env.local');
  const envFile = readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      process.env[key] = value;
    }
  });
} catch (err) {
  console.log('⚠️  No .env.local file found, using existing environment variables');
}

const SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const PRICE_LITE = process.env.STRIPE_PRICE_LITE;
const PRICE_STANDARD = process.env.STRIPE_PRICE_STANDARD;
const PRICE_PRO = process.env.STRIPE_PRICE_PRO;

console.log('\n🔍 Stripe Configuration Test\n');
console.log('━'.repeat(60));

// 1. Check environment variables
console.log('\n1️⃣  Environment Variables:');
console.log(`   STRIPE_SECRET_KEY: ${SECRET_KEY ? '✅ Set' : '❌ Missing'}`);
if (SECRET_KEY) {
  console.log(`   Format: ${SECRET_KEY.startsWith('sk_') ? '✅ Valid' : '❌ Invalid (must start with sk_)'}`);
  console.log(`   Type: ${SECRET_KEY.startsWith('sk_test_') ? 'Test Mode' : SECRET_KEY.startsWith('sk_live_') ? 'Live Mode' : 'Unknown'}`);
  console.log(`   Preview: ${SECRET_KEY.substring(0, 12)}...${SECRET_KEY.substring(SECRET_KEY.length - 4)}`);
}

console.log(`   STRIPE_PRICE_LITE: ${PRICE_LITE || '❌ Missing'}`);
console.log(`   STRIPE_PRICE_STANDARD: ${PRICE_STANDARD || '❌ Missing'}`);
console.log(`   STRIPE_PRICE_PRO: ${PRICE_PRO || '❌ Missing'}`);

if (!SECRET_KEY) {
  console.log('\n❌ STRIPE_SECRET_KEY is not set. Cannot proceed with tests.');
  console.log('\n📝 To fix:');
  console.log('   1. Go to: https://dashboard.stripe.com/test/apikeys');
  console.log('   2. Copy your "Secret key"');
  console.log('   3. Add to .env.local: STRIPE_SECRET_KEY=sk_test_...');
  console.log('   4. Add to Vercel: vercel env add STRIPE_SECRET_KEY');
  process.exit(1);
}

// 2. Test Stripe connection
console.log('\n2️⃣  Testing Stripe Connection:');
try {
  const stripe = new Stripe(SECRET_KEY, { apiVersion: '2024-06-20' });
  
  console.log('   Fetching account info...');
  const account = await stripe.accounts.retrieve();
  console.log(`   ✅ Connected to Stripe account: ${account.id}`);
  console.log(`   Account name: ${account.settings?.dashboard?.display_name || account.business_profile?.name || 'N/A'}`);
  console.log(`   Country: ${account.country}`);
  console.log(`   Charges enabled: ${account.charges_enabled ? '✅ Yes' : '❌ No'}`);
  
  // 3. Validate Price IDs
  console.log('\n3️⃣  Validating Price IDs:');
  
  const prices = [
    { name: 'Lite', id: PRICE_LITE },
    { name: 'Standard', id: PRICE_STANDARD },
    { name: 'Pro', id: PRICE_PRO },
  ];
  
  for (const price of prices) {
    if (!price.id) {
      console.log(`   ${price.name}: ❌ Not configured`);
      continue;
    }
    
    try {
      console.log(`   ${price.name} (${price.id}):`);
      const priceObj = await stripe.prices.retrieve(price.id);
      console.log(`      ✅ Valid and ${priceObj.active ? 'active' : '⚠️  inactive'}`);
      console.log(`      Amount: $${(priceObj.unit_amount / 100).toFixed(2)} ${priceObj.currency.toUpperCase()}`);
      console.log(`      Type: ${priceObj.type}`);
      console.log(`      Billing: ${priceObj.recurring?.interval || 'one-time'}`);
      
      if (priceObj.product) {
        const product = await stripe.products.retrieve(priceObj.product);
        console.log(`      Product: ${product.name}`);
      }
    } catch (err) {
      console.log(`      ❌ Error: ${err.message}`);
      if (err.code === 'resource_missing') {
        console.log(`      This Price ID doesn't exist in this Stripe account.`);
      }
    }
  }
  
  // 4. Summary
  console.log('\n━'.repeat(60));
  console.log('📊 Summary:\n');
  
  const allPricesSet = PRICE_LITE && PRICE_STANDARD && PRICE_PRO;
  if (!allPricesSet) {
    console.log('❌ Missing Price IDs. You need to set all three:');
    console.log('   STRIPE_PRICE_LITE, STRIPE_PRICE_STANDARD, STRIPE_PRICE_PRO\n');
    console.log('📝 How to get Price IDs:');
    console.log('   1. Go to: https://dashboard.stripe.com/test/products');
    console.log('   2. Find or create your products');
    console.log('   3. Click on a product → Copy the Price ID (starts with price_)');
    console.log('   4. Add to .env.local and Vercel environment variables\n');
  } else {
    console.log('✅ All environment variables are set');
    console.log('✅ Stripe connection successful');
    console.log('\n🎉 Your Stripe configuration looks good!\n');
  }
  
} catch (err) {
  console.log(`   ❌ Connection failed: ${err.message}`);
  console.log('\n📝 Possible issues:');
  console.log('   1. Invalid STRIPE_SECRET_KEY');
  console.log('   2. Network connectivity problem');
  console.log('   3. Stripe API is down (check status.stripe.com)');
  console.log('\n💡 Try:');
  console.log('   - Regenerate your API key in Stripe Dashboard');
  console.log('   - Check your internet connection');
  console.log('   - Verify the key hasn\'t expired');
  process.exit(1);
}

