# Vercel Environment Variables Setup

## ✅ Stripe Configuration

Add these environment variables in your Vercel dashboard:

### 1. Go to Vercel Dashboard
```
https://vercel.com/[your-team]/outboundrevive/settings/environment-variables
```

### 2. Add Each Variable

Click "Add New" for each of these:

#### Stripe Secret Key (Test Mode)
```
Name: STRIPE_SECRET_KEY
Value: sk_test_... (from Stripe Dashboard → Developers → API Keys)
Environment: Production, Preview, Development
```
⚠️ **Use the secret key you provided in chat**

#### Stripe Webhook Secret
```
Name: STRIPE_WEBHOOK_SECRET
Value: whsec_... (from Stripe Dashboard → Webhooks → Signing Secret)
Environment: Production, Preview, Development
```
⚠️ **Use the webhook secret you provided in chat**

#### Stripe Price IDs

**Lite Plan (1,000 segments, $299/mo)**
```
Name: STRIPE_PRICE_LITE
Value: prod_... (Lite plan product ID from Stripe)
Environment: Production, Preview, Development
```
⚠️ **Use: prod_TKjdy7oHJKhM0I** (from your message)

**Standard Plan (2,000 segments, $399/mo)**
```
Name: STRIPE_PRICE_STANDARD
Value: prod_... (Standard plan product ID from Stripe)
Environment: Production, Preview, Development
```
⚠️ **Use: prod_TKjdh94MRLplPt** (from your message)

**Pro Plan (5,000 segments, $599/mo)**
```
Name: STRIPE_PRICE_PRO
Value: prod_... (Pro plan product ID from Stripe)
Environment: Production, Preview, Development
```
⚠️ **Use: prod_TKje0kPuM3Qkof** (from your message)

---

## ⚙️ Stripe Webhook Configuration

### Setup Webhook in Stripe Dashboard

1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click **"Add endpoint"**
3. Set endpoint URL:
   ```
   https://www.outboundrevive.com/api/webhooks/stripe
   ```
4. Select events to listen for:
   - ✅ `checkout.session.completed`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`
   - ✅ `invoice.payment_succeeded`
   - ✅ `invoice.payment_failed`

5. Click **"Add endpoint"**
6. Copy the **Signing secret** (starts with `whsec_...`)
7. This should match your `STRIPE_WEBHOOK_SECRET` above

---

## 🧪 Testing the Integration

### 1. Verify Environment Variables
```bash
# Check if vars are set in Vercel
vercel env ls
```

### 2. Test Stripe Connection
Visit your pricing page:
```
https://www.outboundrevive.com/pricing
```

Click "Upgrade to Lite" → should redirect to Stripe Checkout (test mode)

### 3. Test Webhook
Use Stripe CLI locally:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Or use Stripe Dashboard webhook logs to see if events are being received.

### 4. Complete a Test Purchase
1. Use Stripe test card: `4242 4242 4242 4242`
2. Any future expiry date
3. Any 3-digit CVC
4. Any ZIP code

### 5. Verify Cap Update
After successful checkout, check your database:
```sql
SELECT plan_tier, monthly_cap_segments 
FROM tenant_billing 
WHERE account_id = 'your-account-id';
```

Should show the new plan tier and cap.

---

## 🚨 Important Notes

### Test vs Production Mode
- You're currently using **test mode** keys (`sk_test_...`)
- For production, you'll need to:
  1. Switch to live mode in Stripe dashboard
  2. Get live API keys (`sk_live_...`)
  3. Create live price IDs for each plan
  4. Update webhook URL to use live endpoint
  5. Update Vercel env vars with live keys

### Security
- ✅ Never commit API keys to git
- ✅ Always use environment variables
- ✅ Webhook secret validates requests are from Stripe
- ✅ Test mode keys can't charge real cards

### Pricing Structure
```
One-time: $299 setup (manual invoice/collection)
Monthly Plans:
  - Lite: $299/mo → 1,000 SMS segments
  - Standard: $399/mo → 2,000 SMS segments
  - Pro: $599/mo → 5,000 SMS segments
```

---

## ✅ Verification Checklist

After setting up, verify:

- [ ] All 5 env vars show in Vercel dashboard
- [ ] Pricing page loads at `/pricing`
- [ ] Clicking "Upgrade" opens Stripe Checkout
- [ ] Test card completes checkout successfully
- [ ] Webhook logs show `checkout.session.completed` event
- [ ] Database `tenant_billing` table updates with new plan
- [ ] Dashboard shows updated usage cap
- [ ] SMS sending respects new cap limit

---

## 🐛 Troubleshooting

### "Stripe not configured" error
- Check `STRIPE_SECRET_KEY` is set in Vercel
- Redeploy after adding env vars

### Checkout page not loading
- Verify `STRIPE_PRICE_LITE/STANDARD/PRO` match your Stripe product IDs
- Check Vercel function logs for errors

### Webhook not receiving events
- Verify webhook URL in Stripe dashboard
- Check `STRIPE_WEBHOOK_SECRET` matches Stripe
- Look at Stripe webhook attempt logs

### Cap not updating after purchase
- Check webhook handler logs in Vercel
- Verify `plan_id` is in checkout session metadata
- Ensure `account_id` is passed correctly

---

## 📞 Next Steps

1. **Add env vars to Vercel** (copy-paste from above)
2. **Redeploy** (or Vercel will auto-redeploy after env changes)
3. **Test checkout flow** with test card
4. **Verify webhook** receives events
5. **Switch to live mode** when ready for production

Everything should work once these 5 environment variables are set! 🚀

