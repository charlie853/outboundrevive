# Booking Tracking Setup & Troubleshooting

## **Problem**
Someone booked an appointment but the dashboard "Booked" metric didn't update.

---

## **How Booking Tracking Works**

The system tracks bookings from **3 sources**:

### **1. Calendar Webhooks** (Recommended ⭐)
- **Cal.com** or **Calendly** sends a webhook when someone books
- Webhook creates a record in the `appointments` table
- Dashboard counts `appointments` with `status = 'booked'` or `'rescheduled'`

### **2. AI Intent Detection**
- AI detects booking intent in text messages
- Marks `messages_out` with `intent = 'booked'`
- Dashboard counts these messages

### **3. Lead Status Updates**
- Manual updates to `leads.last_booking_status`
- Less automatic but can be used as backup

---

## **✅ Setup Checklist**

To get booking tracking working, you need:

### **Step 1: Appointments Table**
Run this SQL in Supabase SQL Editor:
```sql
-- Check if table exists
SELECT * FROM appointments LIMIT 1;
```

If you get an error:
```bash
# Run the migration
sql/2025-11-12_appointments_table.sql
```

---

### **Step 2: Configure Calendar Webhooks**

#### **For Cal.com:**
1. Go to: https://app.cal.com/settings/developer/webhooks
2. Click "New Webhook"
3. **Webhook URL**: `https://www.outboundrevive.com/api/webhooks/calendar/calcom`
4. **Triggers**: Select all booking events (created, rescheduled, cancelled, completed, no-show)
5. **Custom Headers**:
   ```
   x-account-id: YOUR_ACCOUNT_ID_HERE
   ```
6. Click "Save"

#### **For Calendly:**
1. Go to: https://calendly.com/integrations/api_webhooks
2. Click "Add Webhook"
3. **Webhook URL**: `https://www.outboundrevive.com/api/webhooks/calendar/calendly`
4. **Events**: Select all (invitee.created, invitee.canceled, etc.)
5. **Custom Headers**:
   ```
   x-account-id: YOUR_ACCOUNT_ID_HERE
   ```
6. Click "Create Webhook"

---

### **Step 3: Get Your Account ID**

In your browser console while logged into the dashboard:
```javascript
localStorage.getItem('outbound_account_id')
```

Or query Supabase:
```sql
SELECT account_id FROM user_data WHERE user_id = auth.uid();
```

---

## **🧪 How to Test**

### **Method 1: Book a Test Appointment**
1. Use your booking link
2. Book an appointment with your own phone/email
3. Check Supabase:
```sql
SELECT * FROM appointments 
WHERE account_id = 'YOUR_ACCOUNT_ID' 
ORDER BY created_at DESC 
LIMIT 5;
```

4. If a record appears, webhooks are working! ✅
5. Refresh your dashboard - the "Booked" count should update

---

### **Method 2: Check Webhook Logs**

**Cal.com:**
- Go to webhook settings
- Click on your webhook
- View "Recent Deliveries" at the bottom
- Look for 200 status codes (success)

**Calendly:**
- Check webhook logs in Calendly dashboard
- Look for successful deliveries

---

## **🔍 Debugging**

### **Problem: Webhook is firing but no appointment appears**

1. **Check the webhook payload includes phone or email**:
   - Cal.com: `payload.attendees[0].email` or `payload.attendees[0].phone`
   - Calendly: `payload.invitee.email` or `payload.invitee.text_reminder_number`

2. **Verify lead exists in your account**:
```sql
SELECT id, name, phone, email 
FROM leads 
WHERE account_id = 'YOUR_ACCOUNT_ID'
AND (phone = '+15551234567' OR email = 'test@example.com');
```

3. **Check webhook is hitting the right endpoint**:
   - Must be `/api/webhooks/calendar/calcom` or `/api/webhooks/calendar/calendly`
   - Must be `POST` request
   - Must include `x-account-id` header

---

### **Problem: Dashboard shows 0 booked even though appointments table has data**

1. **Check the date range**:
   - Dashboard filters by `created_at` timestamp
   - If you're viewing "7D" but booking was 8 days ago, it won't show
   - Try "All Time" view

2. **Check the account_id matches**:
```sql
SELECT account_id, status, created_at 
FROM appointments 
WHERE status IN ('booked', 'rescheduled')
ORDER BY created_at DESC;
```

3. **Verify metrics API is working**:
```bash
curl "https://www.outboundrevive.com/api/metrics?account_id=YOUR_ACCOUNT_ID&range=all"
```

Look for:
```json
{
  "kpis": {
    "appointmentsBooked": 5,  // Should be > 0
    ...
  }
}
```

---

### **Problem: No webhook endpoint in Vercel logs**

If webhooks aren't even reaching Vercel:

1. **Verify the URL is correct** (no typos)
2. **Check firewall/security settings** in Cal.com/Calendly
3. **Test webhook manually**:
```bash
curl -X POST https://www.outboundrevive.com/api/webhooks/calendar/calcom \
  -H "Content-Type: application/json" \
  -H "x-account-id: YOUR_ACCOUNT_ID" \
  -d '{
    "triggerEvent": "BOOKING_CREATED",
    "payload": {
      "uid": "test-123",
      "startTime": "2025-11-14T15:00:00Z",
      "attendees": [{
        "email": "test@example.com",
        "phone": "+15551234567"
      }]
    }
  }'
```

Expected response: `{"ok": true}`

---

## **🚀 Quick Fix: Manual Booking**

If webhooks aren't set up yet and you need to track a booking NOW:

```sql
-- Insert appointment manually
INSERT INTO appointments (
  account_id,
  lead_id,
  provider,
  provider_event_id,
  status,
  scheduled_at,
  attendee_name,
  attendee_email,
  attendee_phone,
  event_type,
  created_at
) VALUES (
  'YOUR_ACCOUNT_ID',
  'LEAD_ID_FROM_LEADS_TABLE',
  'manual',
  'manual-' || gen_random_uuid(),
  'booked',
  '2025-11-14 15:00:00',
  'Customer Name',
  'customer@example.com',
  '+15551234567',
  '30 Min Intro Call',
  NOW()
);

-- Update lead status
UPDATE leads
SET last_booking_status = 'booked',
    appointment_set_at = NOW()
WHERE id = 'LEAD_ID_FROM_LEADS_TABLE';
```

Then refresh your dashboard!

---

## **📋 Related Files**

- **Webhook Handlers**:
  - `app/api/webhooks/calendar/calcom/route.ts`
  - `app/api/webhooks/calendar/calendly/route.ts`

- **Dashboard Metrics**:
  - `pages/api/metrics.ts` (lines 189-203)

- **Database Schema**:
  - `sql/2025-11-12_appointments_table.sql`

---

## **✨ Best Practice**

Set up webhooks immediately after getting your first calendar link. This ensures:
✅ Automatic booking tracking
✅ Accurate dashboard metrics
✅ Lead status updates
✅ Timeline notes for each booking

---

**Status**: Documented  
**Date**: November 13, 2025

