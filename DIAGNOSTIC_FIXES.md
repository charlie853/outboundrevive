# Diagnostic Report & Fixes - 2025-10-29 (Part 2)

## 🔍 **Issues Reported**
1. "Who is this?" still giving canned response
2. "What is outbound revive?" giving old response  
3. Dashboard looks the same (no visible changes)
4. Threads showing AI bot texts but NOT person's responses

---

## 🐛 **Root Causes Found**

### **Issue 1: Inbound Messages Never Persisted**
- **Root Cause**: The Twilio webhook (`pages/api/webhooks/twilio/inbound.ts`) had NO code to save inbound messages to the `messages_in` table
- **Evidence**: Only `persistOut()` existed, never `persistIn()`
- **Impact**: Threads query could only show outbound messages from `messages_out` table
- **Severity**: **CRITICAL** - Core functionality broken

### **Issue 2: System Prompt Cached Globally**
- **Root Cause**: `SYSTEM_PROMPT_TEMPLATE` variable cached prompt on first load
- **Evidence**: Line 22 in `inbound.ts` showed `if (SYSTEM_PROMPT_TEMPLATE) return SYSTEM_PROMPT_TEMPLATE;`
- **Impact**: Changes to `prompts/sms_system_prompt.md` required server restart to take effect
- **Severity**: **HIGH** - Prevented prompt improvements from deploying

### **Issue 3: Dashboard Changes Were Only Code Comments**
- **Root Cause**: Previous fixes only added `TODO` comments, no actual UI changes
- **Evidence**: No visible tooltips, export buttons, or enhanced charts existed
- **Impact**: User couldn't see any improvements, dashboard looked identical
- **Severity**: **MEDIUM** - User experience issue

---

## ✅ **Fixes Applied**

### **Fix 1: Added `persistIn()` Function**
**File**: `pages/api/webhooks/twilio/inbound.ts`

```typescript
// === Persist INBOUND message to messages_in ===
async function persistIn(leadId: string, body: string, fromPhone: string, toPhone: string) {
  if (!leadId || !body) return;

  try {
    const { error } = await supabaseAdmin
      .from("messages_in")
      .insert({
        lead_id: leadId,
        account_id: ACCOUNT_ID,
        body,
        provider_from: fromPhone,
        provider_to: toPhone,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error("messages_in insert failed:", error);
    } else {
      console.log("messages_in insert ok for lead", leadId);
    }
  } catch (err) {
    console.error("persistIn error:", err);
  }
}
```

**Called At**: Line 500, immediately after lead lookup:
```typescript
// === PERSIST INBOUND MESSAGE ===
// Save every inbound message to messages_in table so it shows in threads
await persistIn(leadId, inboundBody, From, To);
```

**Result**: Every inbound SMS now saved to database → threads show full conversation

---

### **Fix 2: Removed Prompt Caching**
**File**: `pages/api/webhooks/twilio/inbound.ts`

**Before**:
```typescript
let SYSTEM_PROMPT_TEMPLATE = "";
function loadSystemPrompt(): string {
  if (SYSTEM_PROMPT_TEMPLATE) return SYSTEM_PROMPT_TEMPLATE;
  // ... load logic
}
```

**After**:
```typescript
function loadSystemPrompt(): string {
  // 1. Try env first
  if (process.env.SMS_SYSTEM_PROMPT) {
    console.log("Using SMS_SYSTEM_PROMPT from env");
    return process.env.SMS_SYSTEM_PROMPT;
  }
  
  // 2. Try file (reload every time for latest changes)
  try {
    const filePath = path.join(process.cwd(), "prompts", "sms_system_prompt.md");
    const content = fs.readFileSync(filePath, "utf8");
    console.log("Loaded system prompt from file, length:", content.length);
    return content;
  } catch (err) {
    console.error("Failed to load system prompt from file:", err);
    return "You are Charlie from OutboundRevive. Be brief, helpful, and book appointments.";
  }
}
```

**Result**: Prompt updates take effect immediately on next request (no restart needed)

---

### **Fix 3: Dashboard Visible UI Improvements**

#### **3a. KPI Cards with Tooltips**
**File**: `app/(app)/dashboard/components/KpiCards.tsx`

- Added `'use client'` directive for interactivity
- Created `MetricItem` type with `description` field
- Added info icon (ℹ️) that shows tooltip on hover
- Descriptions explain what each metric means:
  - New Leads: "Total leads added to OutboundRevive in this period"
  - Messages Sent: "Total outbound SMS messages sent by the AI"
  - Delivered %: "Percentage of sent messages successfully delivered (excludes failed/invalid numbers)"
  - Replies: "Total inbound messages received from leads"

#### **3b. Dashboard Header**
**File**: `app/components/MetricsPanel.tsx`

Added prominent blue info banner:
```tsx
<div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
  <h2 className="text-lg font-semibold text-sky-900 mb-1">Live Performance Dashboard</h2>
  <p className="text-sm text-sky-700">
    Track your AI texter's outreach performance and conversation health in real-time. 
    Metrics update as messages are sent and leads respond.
  </p>
</div>
```

#### **3c. Export CSV Button**
**File**: `app/components/MetricsPanel.tsx`

- Generates CSV with current metrics and deltas
- Downloads as `outboundrevive-metrics-{range}.csv`
- Includes icon and hover state

#### **3d. Enhanced Funnel Chart**
**File**: `app/(app)/dashboard/components/Funnel.tsx`

**New Features**:
- Title: "Conversion Funnel"
- Description: "Track how leads progress from initial contact to engagement"
- **Conversion percentages** shown at each stage:
  - Contacted: `(sent / leads) * 100`
  - Delivered: `(delivered / sent) * 100`
  - Replied: `(replied / delivered) * 100`
- Visual progress bars with gradient colors
- **Conversion Summary** section showing:
  - Contact Rate: % of leads contacted
  - Reply Rate: % of delivered messages that got replies

**Result**: Dashboard now shows clear, visible improvements

---

## 📊 **Verification Steps**

### **1. Test Inbound Messages Showing in Threads**
```bash
# Send a test SMS to your Twilio number
# Check threads view: /leads/[id] or inbox

# Verify in database:
psql $DATABASE_URL -c "SELECT lead_id, body, created_at FROM messages_in ORDER BY created_at DESC LIMIT 5;"
```

**Expected**: Both inbound and outbound messages visible in conversation

---

### **2. Test Prompt Changes Take Effect**
```bash
# Edit prompts/sms_system_prompt.md (add a unique phrase)
# Send test SMS "who is this?"
# Response should reflect the latest prompt changes

# Check logs:
vercel logs | grep "Loaded system prompt from file"
```

**Expected**: Log shows "Loaded system prompt from file, length: XXXX" on each request

---

### **3. Verify Dashboard UI Changes**
1. Navigate to `/dashboard`
2. **Check for**:
   - ✅ Blue banner at top: "Live Performance Dashboard"
   - ✅ Info icons (ℹ️) next to each KPI metric
   - ✅ Hover over info icon → tooltip appears
   - ✅ "Export CSV" button in top-right
   - ✅ Funnel shows conversion percentages inside bars
   - ✅ Conversion Summary at bottom of funnel

---

## 🗄️ **Database Indexes** (Optional Performance)

If threads are slow, run the indexes:
```bash
psql $DATABASE_URL < sql/threads_indexes.sql
```

This adds indexes on:
- `messages_in (lead_id, created_at)`
- `messages_out (lead_id, created_at)`
- `leads (account_id, phone)`
- `leads (last_footer_at)`

---

## 📝 **Files Changed**
1. `pages/api/webhooks/twilio/inbound.ts` — Added `persistIn()`, removed caching
2. `app/(app)/dashboard/components/KpiCards.tsx` — Tooltips & descriptions
3. `app/components/MetricsPanel.tsx` — Header & export button
4. `app/(app)/dashboard/components/Funnel.tsx` — Conversion %s & summary
5. `CHANGELOG.md` — Documented all fixes

---

## 🚀 **Deployment Status**
- ✅ Committed: `f292be3`
- ✅ Pushed to: `origin/main`
- ✅ Vercel: Auto-deploy triggered

**Next Build URL**: Check https://vercel.com/dashboard for latest deployment

---

## 🔄 **Rollback Plan** (If Needed)
```bash
git revert f292be3
git push origin main
```

This will undo:
- `persistIn()` addition
- Prompt caching removal
- Dashboard UI changes

**Note**: Rolling back will re-break threads (inbound msgs won't persist)

---

## 📚 **Related Documentation**
- `SMS_SYSTEM_IMPLEMENTATION.md` — Full SMS system guide
- `CHANGELOG.md` — Release notes for all changes
- `sql/threads_indexes.sql` — Performance indexes

---

## ✨ **Summary**

All three critical issues are now fixed:

1. ✅ **Threads now show both sides of conversation** (inbound + outbound)
2. ✅ **Prompt updates take effect immediately** (no caching)
3. ✅ **Dashboard has visible UI improvements** (tooltips, export, enhanced funnel)

The system should now:
- Correctly persist all inbound messages
- Use the latest prompt on every request
- Display clear, informative metrics in the dashboard

Test by sending SMS messages and checking the dashboard and threads views.

