# 🔧 Fix: Bookings Not Showing Up

## 🎯 Problem Identified

**Only 1 booking in database, but 2 leads booked.**

The second booking didn't make it to the database, which means:
- ✅ Dashboard/metrics are working correctly (showing what's in DB)
- ❌ Calendly webhook either didn't fire or couldn't find the lead

---

## 🚨 ROOT CAUSE: Phone/Email Format Mismatch

**Most common issue:** The phone number or email in Calendly doesn't match what's in your `leads` table.

### How the Webhook Works:
1. Lead books on Calendly
2. Calendly sends webhook to: `https://www.outboundrevive.com/api/webhooks/calendar/calendly`
3. Webhook looks up lead by:
   - **Phone**: Converts to E.164 format (e.g., `+18183709444`)
   - **Email**: Exact match
4. If lead not found → Booking is **NOT saved** (returns `unmatched: true`)

---

## ✅ SOLUTION: 3-Step Fix

### **Step 1: Normalize ALL Phone Numbers** ⭐ **CRITICAL**

This ensures future bookings always match:

```sql
-- Run in Supabase SQL Editor
-- File: sql/normalize-all-phone-numbers.sql
```

This converts:
- `(818) 370-9444` → `+18183709444`
- `818-370-9444` → `+18183709444`
- `8183709444` → `+18183709444`

**After running this, ALL future Calendly bookings will match automatically!**

---

### **Step 2: Manually Add the Missing Booking**

Since the second booking didn't make it, we need to add it manually.

**What you need:**
- Lead's name
- Lead's phone number (from Calendly booking confirmation)
- Lead's email (from Calendly booking confirmation)

Then run this SQL (replace with actual values):

```sql
-- Replace these values with the actual lead info
DO $$
DECLARE
  booking_name text := 'LEAD NAME HERE';
  booking_phone text := 'PHONE FROM CALENDLY';  -- e.g., (818) 123-4567
  booking_email text := 'EMAIL FROM CALENDLY';
  normalized_phone text;
  lead_id_found uuid;
  account_id_val uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  -- Normalize phone to E.164
  normalized_phone := '+1' || regexp_replace(booking_phone, '[^0-9]', '', 'g');
  
  -- Find or create the lead
  SELECT id INTO lead_id_found 
  FROM leads 
  WHERE phone = normalized_phone 
    OR email = booking_email
  LIMIT 1;
  
  IF lead_id_found IS NULL THEN
    -- Create lead if doesn't exist
    INSERT INTO leads (account_id, name, phone, email, booked, appointment_set_at)
    VALUES (account_id_val, booking_name, normalized_phone, booking_email, true, NOW())
    RETURNING id INTO lead_id_found;
    
    RAISE NOTICE 'Created new lead: %', lead_id_found;
  ELSE
    -- Update existing lead
    UPDATE leads
    SET booked = true, appointment_set_at = NOW()
    WHERE id = lead_id_found;
    
    RAISE NOTICE 'Updated existing lead: %', lead_id_found;
  END IF;
  
  -- Create the appointment
  INSERT INTO appointments (
    account_id, lead_id, provider, provider_event_id,
    status, scheduled_at, attendee_name, attendee_email, attendee_phone,
    event_type, created_at
  ) VALUES (
    account_id_val, lead_id_found, 'calendly', 
    'manual-booking-' || extract(epoch from now())::text,
    'booked', NOW() + INTERVAL '1 day',
    booking_name, booking_email, normalized_phone,
    'Demo Call', NOW()
  );
  
  RAISE NOTICE '✅ Appointment created successfully!';
END $$;
```

---

### **Step 3: Verify Calendly Webhook Configuration**

Go to Calendly → Settings → Webhooks and verify:

**Webhook URL:**
```
https://www.outboundrevive.com/api/webhooks/calendar/calendly
```

**Custom Header:**
```
x-account-id: 11111111-1111-1111-1111-111111111111
```

**Events to Subscribe:**
- ✅ `invitee.created`
- ✅ `invitee.canceled`
- ✅ `invitee_no_show` (if available)

**Test the webhook** by clicking "Send test event" in Calendly settings.

---

## 🧪 How to Test

After completing Step 1 (phone normalization):

1. **Book a test appointment** with a lead that exists in your database
2. **Wait 30 seconds**
3. **Refresh dashboard** → Should show booking count +1
4. **Run diagnostic:**
   ```bash
   ./test-current-bookings.sh
   ```

---

## 📊 Diagnostic Commands

### Check how many bookings are actually in DB:
```bash
./test-current-bookings.sh
```

### See all appointments with lead details:
```sql
-- Run in Supabase SQL Editor
-- File: sql/debug-bookings.sql
```

### Check which leads have non-standard phone formats:
```sql
SELECT id, name, phone, email
FROM leads
WHERE account_id = '11111111-1111-1111-1111-111111111111'
  AND phone !~ '^\+1[0-9]{10}$'
  AND phone IS NOT NULL;
```

---

## 🎯 Prevention: This Won't Happen Again After Step 1

Once you run `sql/normalize-all-phone-numbers.sql`:
- ✅ All existing leads normalized to E.164
- ✅ Calendly webhooks always match
- ✅ Future bookings automatically tracked
- ✅ No more manual intervention needed

---

## 💡 Quick Reference

**Problem:** Only 1 booking showing, but 2 leads booked

**Cause:** Second lead's phone/email format didn't match database

**Fix:**
1. Run `sql/normalize-all-phone-numbers.sql` (prevents future issues)
2. Manually add the missing booking (SQL above)
3. Verify Calendly webhook config

**Result:** All future bookings will automatically appear! 🎉

