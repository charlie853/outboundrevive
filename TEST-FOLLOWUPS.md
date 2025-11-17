# Follow-Up System Test Guide

## ✅ Your Cron Jobs Are Already Configured!

In `vercel.json`, you have:
- `/api/cron/enroll-followups` - Runs **hourly** (enrolls leads)
- `/api/internal/followups/tick` - Runs **every 10 minutes** (sends messages)

These use your existing `CRON_SECRET`, `ADMIN_API_KEY`, and `PUBLIC_BASE_URL`.

---

## 🧪 Quick Test (Run in Browser Console or Terminal)

### Test 1: Check if enrollment endpoint works
```bash
curl -X POST https://www.outboundrevive.com/api/cron/enroll-followups \
  -H "x-admin-token: YOUR_ADMIN_API_KEY"
```

**Expected Response:**
```json
{
  "ok": true,
  "enrolled": 0-5,
  "skipped": 0,
  "accounts_processed": 1
}
```

---

### Test 2: Check if tick endpoint works
```bash
curl -X POST https://www.outboundrevive.com/api/internal/followups/tick \
  -H "x-admin-token: YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

**Expected Response:**
```json
{
  "ok": true,
  "picked": 0-5,
  "processed": 0-5
}
```

---

## 🔍 Check Database (Supabase SQL Editor)

### 1. Check if tables exist:
```sql
SELECT * FROM ai_followup_cursor LIMIT 5;
SELECT * FROM ai_followup_log LIMIT 5;
SELECT * FROM account_followup_settings LIMIT 1;
```

**If you get "relation does not exist":**
Run the migration: `sql/2025-11-10_ai_followup_system.sql`

---

### 2. Check for leads that need follow-up:
```sql
SELECT * FROM leads 
WHERE opted_out = false 
  AND (last_reply_at IS NULL OR last_reply_at < NOW() - INTERVAL '48 hours')
  AND (last_outbound_at IS NOT NULL AND last_outbound_at < NOW() - INTERVAL '48 hours')
LIMIT 10;
```

---

### 3. Check if RPC function exists:
```sql
SELECT leads_with_died_conversations(
  '11111111-1111-1111-1111-111111111111', -- your account_id
  48 -- hours
);
```

---

## 🚨 Common Issues

### Issue 1: Tables don't exist
**Symptom:** `relation "ai_followup_cursor" does not exist`

**Fix:** Run this migration in Supabase SQL Editor:
```
sql/2025-11-10_ai_followup_system.sql
```

---

### Issue 2: No leads being enrolled
**Symptoms:**
- `enrolled: 0` in response
- No rows in `ai_followup_cursor` table

**Causes:**
1. No leads have gone silent for 48+ hours
2. All leads have `opted_out = true`
3. RPC function doesn't exist

**Fix:**
- Wait for leads to go silent for 48 hours, OR
- Test with a specific lead that's been silent

---

### Issue 3: Cursors exist but no messages sent
**Symptom:** Rows in `ai_followup_cursor`, but nothing in `ai_followup_log`

**Causes:**
1. `next_at` time hasn't arrived yet
2. Cron job not running (check Vercel logs)
3. Account has `autotexter_enabled = false`

**Fix:**
- Check `next_at` times in database
- Verify `autotexter_enabled = true` for your account
- Check Vercel → Deployments → Logs for cron errors

---

## 📊 Monitor Cron Jobs in Vercel

1. Go to: **https://vercel.com/your-project/deployments**
2. Click on latest deployment
3. Click **"Functions"** tab
4. Look for:
   - `/api/cron/enroll-followups` - Should run hourly
   - `/api/internal/followups/tick` - Should run every 10 min
5. Check logs for errors

---

## ✅ What to Tell Me

After testing, share:
1. Do the tables exist in Supabase?
2. What does Test 1 (enrollment) return?
3. What does Test 2 (tick) return?
4. Are there any errors in Vercel logs?

This will help me pinpoint exactly what's not working!

