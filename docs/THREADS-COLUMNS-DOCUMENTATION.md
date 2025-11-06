# Threads Columns Documentation

**Date:** 2025-01-XX  
**Status:** ✅ Complete

---

## Overview

The Threads list now displays key status information in a table format with clear columns for quick triage and lead management.

---

## Columns

### 1. **Name**
- **Source:** `leads.name` or formatted phone number
- **Display:** Lead name with phone number below in smaller text
- **Format:** Name on first line, phone in format `(XXX) XXX-XXXX` below

### 2. **Opted Out**
- **Source:** `leads.opted_out` (boolean)
- **Display:** 
  - "Yes" (red, bold) if `opted_out = true`
  - "No" (gray) if `opted_out = false`
- **DB Field:** `leads.opted_out` (boolean, default: false)

### 3. **Booked**
- **Source:** `appointments.status` (latest appointment) or `leads.appointment_set_at` / `leads.booked`
- **Display:**
  - "Booked" (green, bold) - appointment booked
  - "Kept" (green, bold) - appointment kept
  - "Canceled" (gray) - appointment canceled
  - "No Show" (gray) - appointment no-show
  - "Rescheduled" (blue) - appointment rescheduled
  - "Not booked" (gray) - no booking
- **DB Fields:** 
  - `appointments.status` (from `appointments` table, latest per lead)
  - `leads.appointment_set_at` (fallback)
  - `leads.booked` (fallback)

### 4. **Last Reply**
- **Source:** `leads.last_reply_at` (timestamp)
- **Display:** Formatted timestamp of last inbound message, or "—" if none
- **Format:** `MM/DD/YYYY, HH:MM:SS AM/PM` (localized)
- **DB Field:** `leads.last_reply_at` (timestamptz)

### 5. **Lead Type**
- **Source:** `leads.lead_type` (text)
- **Display:**
  - "New Lead" if `lead_type = 'new'`
  - "Old Lead" if `lead_type = 'old'`
  - Raw value if other
  - "—" if null
- **DB Field:** `leads.lead_type` (text, nullable, check constraint: 'new' or 'old')

### 6. **Owner**
- **Source:** `leads.crm_owner` (text)
- **Display:** CRM owner/rep name, or "—" if not assigned
- **DB Field:** `leads.crm_owner` (text, nullable)

### 7. **Last Message**
- **Source:** `leads.last_reply_body` (text)
- **Display:** Preview of last message (truncated with ellipsis), with timestamp below
- **Format:** Single line preview, timestamp in smaller text below
- **DB Field:** `leads.last_reply_body` (text, nullable)

### 8. **Action**
- **Display:** "View" button to open thread detail modal
- **Behavior:** Opens full conversation view with all messages

---

## Backend API

### Endpoint
`GET /api/threads?limit=20&account_id={accountId}`

### Response Fields
```typescript
{
  ok: true,
  threads: [
    {
      id: string,
      phone: string,
      name: string,
      opted_out: boolean,
      lead_type: string | null,
      crm_owner: string | null,
      booking_status: string | null,
      last_reply_at: string | null,
      lastMessage: string | null,
      lastAt: string,
      // ... other fields
    }
  ]
}
```

### Database Queries

**Main Query:**
```sql
SELECT 
  id, phone, name, 
  last_reply_body, last_reply_at, last_sent_at,
  opted_out, lead_type, crm_owner,
  appointment_set_at, booked, created_at
FROM leads
WHERE account_id = {accountId}
ORDER BY last_reply_at DESC NULLS LAST, last_sent_at DESC NULLS LAST, created_at DESC
LIMIT {limit * 3}
```

**Appointments Query (for booking status):**
```sql
SELECT lead_id, status, starts_at
FROM appointments
WHERE lead_id IN ({leadIds}) 
  AND account_id = {accountId}
ORDER BY starts_at DESC NULLS LAST, created_at DESC
```

---

## UI Implementation

### Table Structure
- **Layout:** Responsive table with horizontal scroll on small screens
- **Styling:** 
  - Hover effect on rows
  - Reduced opacity for opted-out leads
  - Color-coded status values
- **Responsive:** Table scrolls horizontally on narrow screens

### Column Widths
- Name: Auto (flexible)
- Opted Out: ~80px
- Booked: ~100px
- Last Reply: ~140px
- Lead Type: ~100px
- Owner: ~120px
- Last Message: ~200px (max-width with truncation)
- Action: ~80px

---

## Future Modifications

### Adding New Columns

1. **Update Backend API** (`pages/api/threads.ts`):
   - Add field to SELECT query
   - Include in response object

2. **Update Frontend** (`app/components/ThreadsPanel.tsx`):
   - Add column header in `<thead>`
   - Add data cell in `<tbody>` row
   - Format value appropriately

### Example: Adding "Last Contact" Column

**Backend:**
```typescript
// In pages/api/threads.ts
select: '..., last_contact_at', // Add to SELECT
// In response
last_contact_at: row.last_contact_at ?? null,
```

**Frontend:**
```tsx
// In app/components/ThreadsPanel.tsx
<th>Last Contact</th> // Add header
<td>{thread.last_contact_at ? new Date(thread.last_contact_at).toLocaleString() : '—'}</td> // Add cell
```

### Modifying Lead Type Values

If you need to add more lead types (e.g., "former_client"):

1. **Update Database:**
```sql
ALTER TABLE public.leads 
  DROP CONSTRAINT IF EXISTS leads_lead_type_check;
ALTER TABLE public.leads 
  ADD CONSTRAINT leads_lead_type_check 
  CHECK (lead_type IS NULL OR lead_type IN ('new', 'old', 'former_client'));
```

2. **Update Frontend Display:**
```tsx
// In ThreadsPanel.tsx
const leadTypeDisplay = leadType 
  ? (leadType === 'new' ? 'New Lead' : 
     leadType === 'old' ? 'Old Lead' : 
     leadType === 'former_client' ? 'Former Client' :
     leadType)
  : '—';
```

---

## Database Fields Reference

| Column | DB Field | Type | Source |
|--------|----------|------|--------|
| Opted Out | `leads.opted_out` | boolean | Direct from leads table |
| Booked | `appointments.status` | text | Latest appointment per lead |
| Last Reply | `leads.last_reply_at` | timestamptz | Direct from leads table |
| Lead Type | `leads.lead_type` | text | Direct from leads table |
| Owner | `leads.crm_owner` | text | Direct from leads table |
| Last Message | `leads.last_reply_body` | text | Direct from leads table |

---

## Notes

- All queries are scoped by `account_id` for multi-tenant isolation
- Booking status is determined from `appointments` table first, then falls back to `leads.appointment_set_at` or `leads.booked`
- Table is responsive and scrolls horizontally on narrow screens
- Opted-out leads are shown with reduced opacity (60%) for visual distinction
- All timestamps are displayed in user's local timezone

---

**Ready for use** ✅

