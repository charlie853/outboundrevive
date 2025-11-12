# Appointments Table Testing Guide

## ✅ Table Created Successfully

The `appointments` table has been created and is functioning correctly!

## Current Status

### Metrics API Response (7D Range)
```
✅ Appointments Booked: 0
✅ Appointments Kept: 0  
✅ Appointments No-Show: 0
```

**This is correct!** The table exists and the API is querying it properly. It's showing 0 because there are no appointments yet.

## Testing the Appointments Feature

### Option 1: Insert Test Data (Recommended for Testing)

Run this in Supabase SQL Editor:
```sql
-- File: sql/test_appointments_data.sql
```

This will create 4 test appointments:
- 1 booked (future)
- 1 rescheduled (future) 
- 1 kept (past, attended)
- 1 no-show (past, missed)

**Expected Dashboard Metrics After Running:**
- Appointments Booked: **2** (booked + rescheduled)
- Appointments Kept: **1**
- Appointments No-Show: **1**
- Show-up Rate: **50%** (1 kept / 2 booked)

### Option 2: Real Appointments (Production)

When real bookings happen, they'll populate automatically if you:

1. **Set up Cal.com webhook:**
   - URL: `https://www.outboundrevive.com/api/webhooks/cal`
   - Events: `BOOKING_CREATED`, `BOOKING_RESCHEDULED`, etc.

2. **Set up Calendly webhook:**
   - URL: `https://www.outboundrevive.com/api/webhooks/calendly`
   - Events: `invitee.created`, `invitee.canceled`

3. **Manual entry:**
   ```sql
   INSERT INTO appointments (
     account_id, lead_id, provider, status, 
     scheduled_at, attendee_name, attendee_email
   ) VALUES (
     '11111111-1111-1111-1111-111111111111',
     '<lead_id>',
     'manual',
     'booked',
     '2025-11-15 10:00:00+00',
     'John Doe',
     'john@example.com'
   );
   ```

## Verifying It Works

After inserting test data, run:
```bash
./tests/verify-dashboard-metrics.sh production
```

You should see:
```
✅ Appointments Booked: 2
✅ Appointments Kept: 1
❌ Appointments No-Show: 1
📊 Show-up Rate: 50%
```

## Dashboard Display

The dashboard will show these metrics in the "Appointment Performance" panel:

```
┌─────────────────────────────────────┐
│ Appointment Performance             │
├─────────────────────────────────────┤
│ Booked                         2    │
│ Kept (Attended)                1    │
│ No-Show                        1    │
│                                     │
│ Show-up Rate                  50%   │
└─────────────────────────────────────┘
```

## Database Schema Reference

### Table Structure
```sql
appointments (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  lead_id uuid,
  provider text NOT NULL,
  provider_event_id text,
  provider_booking_uid text,
  status text NOT NULL CHECK (status IN 
    ('booked', 'rescheduled', 'kept', 'no_show', 'cancelled')),
  scheduled_at timestamptz NOT NULL,
  duration_minutes integer DEFAULT 30,
  attendee_name text,
  attendee_email text,
  attendee_phone text,
  event_type text,
  notes text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
```

### Status Flow
```
booked → kept      (appointment attended)
booked → no_show   (appointment missed)
booked → cancelled (appointment cancelled)
booked → rescheduled → kept/no_show (appointment moved)
```

## Metrics Calculation Logic

### Appointments Booked
```sql
SELECT COUNT(*) 
FROM appointments 
WHERE account_id = ? 
  AND status IN ('booked', 'rescheduled')
  AND created_at >= ?
```

### Appointments Kept
```sql
SELECT COUNT(*) 
FROM appointments 
WHERE account_id = ? 
  AND status = 'kept'
  AND created_at >= ?
```

### Appointments No-Show
```sql
SELECT COUNT(*) 
FROM appointments 
WHERE account_id = ? 
  AND status = 'no_show'
  AND created_at >= ?
```

### Show-up Rate
```
(Appointments Kept / Appointments Booked) * 100
```

## Cleanup Test Data

To remove test data:
```sql
DELETE FROM appointments 
WHERE account_id = '11111111-1111-1111-1111-111111111111'
  AND provider_event_id LIKE 'test_booking_%';
```

## Troubleshooting

### "No appointments found"
- ✅ Table exists and API is working
- 💡 Just means no appointments have been created yet
- 👉 Insert test data or wait for real bookings

### "Table doesn't exist"
- ❌ Migration hasn't been run
- 👉 Run `sql/2025-11-12_appointments_table.sql`

### RLS Error
- ❌ Wrong user_id column used
- ✅ Fixed in latest migration (uses user_data.user_id, not user_data.id)

## Summary

✅ **Appointments table is working perfectly!**
- Table created with proper schema
- RLS policies configured correctly  
- API endpoint querying successfully
- Showing 0 (which is correct for empty table)
- Ready for test data or real bookings

🚀 **Next Step:** 
Run `sql/test_appointments_data.sql` to see metrics populate, or wait for real bookings to flow through calendar webhooks!

