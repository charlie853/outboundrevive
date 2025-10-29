# End-to-End Flow Diagnostic & Implementation Plan
**OutboundRevive - Complete User Journey from Signup to Booking**

---

## 📋 **EXECUTIVE SUMMARY**

### **Status Overview**
| Component | Status | Severity | Action Required |
|-----------|--------|----------|-----------------|
| CRM Connect (Nango OAuth) | ⚠️ **Partial** | 🔴 **HIGH** | Fix popup completion |
| GoHighLevel Support | ❌ **Missing** | 🔴 **HIGH** | Add to Nango config |
| Lead Import & Classification | ⚠️ **Partial** | 🟡 **MEDIUM** | Add lead_type flags |
| Per-Client AI Training | ✅ **Working** | 🟢 **LOW** | Document workflow |
| Context-Aware Reminders | ⚠️ **Partial** | 🟡 **MEDIUM** | Add conversation context |
| Threads Enrichment | ❌ **Missing** | 🟡 **MEDIUM** | Build contact panel |
| Dashboard KPIs | ⚠️ **Partial** | 🟡 **MEDIUM** | Fix calculations |
| Onboarding Flow | ✅ **Exists** | 🟢 **LOW** | Connect to CRM step |

---

## 🔍 **DETAILED ROOT CAUSE ANALYSIS**

### **1. CRM Connect (Nango OAuth) — CRITICAL FIX NEEDED**

#### **Current Implementation**
**Files:**
- `app/components/CRMIntegrations.tsx` — UI component with Nango SDK
- `app/api/crm/session-token/route.ts` — Creates Nango session
- `app/api/crm/connect/route.ts` — Saves connection to DB
- `app/api/oauth/nango/route.ts` — Legacy direct OAuth (not used)

**Flow:**
```
1. User clicks "Connect CRM" → handleConnectCRM()
2. Component calls `/api/crm/session-token` (POST)
3. Opens Nango ConnectUI popup with sessionToken
4. On 'connect' event → POST to `/api/crm/connect` with connectionId
5. Saves to user_data.nango_token and user_data.crm
```

#### **ROOT CAUSES OF POPUP FAILURE**

**A) Session Token Creation Issues**
```typescript
// app/api/crm/session-token/route.ts:7-12
const CRM_INTEGRATIONS = [
  'hubspot',
  'salesforce',
  // 'pipedrive', - annoying to get token for
  'zoho-crm'
];
```
**Problem**: Limited to 3 CRMs; GHL not included
**Impact**: GoHighLevel won't appear in allowed_integrations

**B) Connection Save Location**
```typescript
// app/api/crm/connect/route.ts:42-48
const { error: updateError } = await supabaseAdmin
  .from('user_data')
  .update({
    nango_token: token,
    crm: providerConfigKey,
  })
  .eq('user_id', user.id);
```
**Problems**:
1. Saves to `user_data` table (may not exist or have wrong schema)
2. Only stores access_token, not full Nango connectionId
3. No account_id linkage for multi-user accounts
4. Missing refresh_token handling

**C) Missing Error Feedback**
```typescript
// app/components/CRMIntegrations.tsx:88-90
} catch (error) {
  console.error('Error saving CRM connection:', error);
  onError?.('Connection established but failed to save. Please try again.');
```
**Problem**: Generic error message; doesn't tell user what failed

**D) Nango Provider Config Missing**
**Evidence**: No GHL config found in search results
**Required**: Nango dashboard must have `gohighlevel` provider_config_key with OAuth scopes

---

### **2. GoHighLevel Support — NOT IMPLEMENTED**

#### **What's Missing**
1. **Nango Provider Config**:
   - Need to add `gohighlevel` integration in Nango dashboard
   - OAuth scopes: `contacts.readonly`, `conversations.readonly`, `locations.readonly`
   - Callback URL: `https://app.nango.dev/oauth/callback`

2. **UI Support**:
```typescript
// app/api/crm/session-token/route.ts needs:
const CRM_INTEGRATIONS = [
  'hubspot',
  'salesforce',
  'zoho-crm',
  'gohighlevel'  // ← ADD THIS
];
```

3. **Adapter Implementation**:
   - Need `lib/crm/gohighlevel.ts` CRM adapter
   - Implement `syncContacts()` for GHL API structure
   - Contacts endpoint: `/v1/contacts/`
   - Phone normalization: GHL stores as `phone` and `altPhone`

4. **Preview Route Support**:
```typescript
// app/api/crm/preview/route.ts:26-36 needs GHL case:
} else if (integrationId === 'gohighlevel') {
  endpoint = '/v1/contacts?limit=100';
}
```

---

### **3. Lead Import & Classification — MISSING FLAGS**

#### **Current Import Flow**
```typescript
// app/api/crm/sync/route.ts:84-127
for (const contact of contacts) {
  const leadData = {
    name: contact.name,
    phone: contact.phone,
    email: contact.email || null,
    account_id: accountId,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  // ← Missing: lead_type, company, role, crm_id, etc.
}
```

#### **Schema Gaps**
**`leads` table missing columns:**
```sql
-- NEED TO ADD:
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS lead_type TEXT CHECK (lead_type IN ('new', 'old')),
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS crm_id TEXT,
  ADD COLUMN IF NOT EXISTS crm_source TEXT,
  ADD COLUMN IF NOT EXISTS crm_stage TEXT,
  ADD COLUMN IF NOT EXISTS crm_owner TEXT,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
```

#### **Classification Logic Not Implemented**
**Required Logic:**
```typescript
function classifyLead(contact: CRMContact, existingLead?: Lead): 'new' | 'old' {
  // New: No prior outbound from us AND no prior inbound
  if (!existingLead) {
    return 'new'; // First time we've seen this contact
  }
  
  // Old: We've contacted them before OR they've replied before
  if (existingLead.last_sent_at || existingLead.last_inbound_at) {
    return 'old';
  }
  
  // CRM shows past activity but we haven't contacted them
  if (contact.lastActivity || contact.dealStage) {
    return 'old';
  }
  
  return 'new';
}
```

---

### **4. Per-Client AI Training — WORKING BUT UNDOCUMENTED**

#### **What Exists**
✅ Knowledge base system (`account_kb_articles`, `kb_chunks`, `kb_embeddings`)
✅ Embedding generation (`/api/internal/knowledge/embed`)
✅ Semantic search (`lib/vector.ts::semanticSearch()`)
✅ Used by SMS agent (inbound webhook calls `semanticSearch()`)

#### **Workflow**
```
1. User adds KB articles via `/api/internal/accounts/[accountId]/kb/upsert`
2. Articles chunked and embedded via `/api/internal/knowledge/embed`
3. Stored in kb_chunks with vector embeddings
4. Inbound webhook queries KB for context
5. LLM uses KB context to generate replies
```

#### **Missing**
❌ UI for adding/managing KB articles (exists as API only)
❌ Onboarding step to populate initial KB
❌ Auto-extraction from CRM notes/docs
❌ Suggested articles based on common questions

---

### **5. Context-Aware Reminders — PARTIAL IMPLEMENTATION**

#### **Current Reminder Systems**
**A) Scheduler** (`/api/scheduler/route.ts`)
- Uses template-based messages (OPENER, NUDGE, RESLOT)
- Step-based progression (0→1→2)
- **NOT context-aware** — doesn't read conversation history

**B) Cron Reminders** (`/api/cron/reminders/route.ts`)
- Reads last outbound/inbound timestamps
- Uses `gentleReminder()` function with counter
- **Minimal context** — only knows prior reminder count

**C) AI Follow-ups** (`/api/internal/followups/tick/route.ts`)
- **BEST** — calls `/api/ai/draft` with full thread context
- Generates contextual message based on conversation
- Implements cadence (3, 7, 14 days)

#### **Problems**
1. **Multiple systems** — inconsistent behavior
2. **Scheduler doesn't read history** — repeats same message
3. **No unified stop logic** — booking doesn't halt reminders automatically
4. **Missing conversation death detection** — doesn't check if lead replied

#### **Required Logic**
```typescript
async function shouldSendReminder(leadId: string): Promise<boolean> {
  const lead = await getL(leadId);
  
  // Stop conditions
  if (lead.opted_out) return false;
  if (lead.booked && lead.appointment_set_at) return false;
  
  // Conversation is alive if recent inbound
  const lastInbound = lead.last_inbound_at;
  const daysSinceInbound = lastInbound 
    ? (Date.now() - new Date(lastInbound).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;
  
  const conversationAlive = daysSinceInbound < 3; // configurable
  if (conversationAlive) return false;
  
  // Check if enough time since last outbound
  const lastOutbound = lead.last_sent_at;
  const daysSinceOutbound = lastOutbound
    ? (Date.now() - new Date(lastOutbound).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;
  
  return daysSinceOutbound >= 3; // configurable
}
```

---

### **6. Threads Enrichment — NO CONTACT PANEL**

#### **Current Implementation**
**File**: `app/components/ThreadsPanel.tsx`

**What Shows:**
- List of threads (phone, name, last message)
- Modal with conversation messages
- Basic phone formatting

**What's Missing:**
❌ Contact detail panel
❌ Company, role, email
❌ CRM stage, owner
❌ Lead type (new/old)
❌ Booking status
❌ Opt-out flag
❌ Link to CRM record

#### **Required UI**
```tsx
<div className="contact-panel">
  <h3>{lead.name}</h3>
  <div className="contact-details">
    <div>Phone: {formatPhone(lead.phone)}</div>
    <div>Email: {lead.email || '—'}</div>
    <div>Company: {lead.company || '—'}</div>
    <div>Role: {lead.role || '—'}</div>
  </div>
  
  <div className="crm-details">
    <div>Source: {lead.crm_source}</div>
    <div>Stage: {lead.crm_stage || 'Unknown'}</div>
    <div>Owner: {lead.crm_owner || 'Unassigned'}</div>
    {lead.crm_id && (
      <a href={getCRMUrl(lead.crm_source, lead.crm_id)} target="_blank">
        View in CRM →
      </a>
    )}
  </div>
  
  <div className="status">
    <div>Type: <Badge>{lead.lead_type}</Badge></div>
    <div>Opted Out: {lead.opted_out ? 'Yes' : 'No'}</div>
    <div>Booked: {lead.booked ? `Yes (${lead.appointment_set_at})` : 'No'}</div>
  </div>
</div>
```

---

### **7. Dashboard KPIs — PARTIALLY INCORRECT**

#### **Current Metrics** (`pages/api/metrics.ts`)
```typescript
// Lines 60-65 (FIXED in recent commit):
const [newLeads, messagesSent, deliveredCount, inboundCount] = await Promise.all([
  count('leads', qsNewLeads),
  count('messages_out', qsMessagesSent),          // ✅ CORRECT
  count('messages_out', qsDelivered),            // ✅ CORRECT
  count('messages_in', qsInbound),               // ✅ CORRECT
]);
```

#### **What's Missing**
❌ **Bookings** — no query for `leads.booked=true` in range
❌ **Reply Rate** — not calculated (Replies / Contacted)
❌ **Time to First Reply** — not calculated
❌ **Reminder Effectiveness** — not tracked
❌ **Opt-out count/rate** — not shown

#### **Required Additions**
```typescript
// Add to metrics endpoint:
const qsBooked = `booked=eq.true&appointment_set_at=gte.${since}`;
const bookings = await count('leads', qsBooked);

// Contacted = distinct leads with messages_out
const { data: contactedLeads } = await supabase
  .from('messages_out')
  .select('lead_id')
  .gte('created_at', since);
const contacted = new Set(contactedLeads?.map(m => m.lead_id)).size;

const replyRate = contacted > 0 ? (replies / contacted) * 100 : 0;

// Time to first reply
const { data: responseTime} = await supabase.rpc('calc_median_response_time', {
  since_iso: since
});
```

---

### **8. Onboarding Flow — EXISTS BUT NOT CONNECTED**

#### **Current State**
```typescript
// app/onboarding/page.tsx:6-14
type State = {
  account_id: string;
  step: 'welcome'|'profile'|'hours'|'number'|'kb'|'imports'|'done';
  business_name?: string|null;
  website?: string|null;
  timezone?: string|null;
  twilio_connected?: boolean;
  kb_ingested?: boolean;
  crm_connected?: boolean;  // ← EXISTS but not used
};
```

#### **What Works**
✅ Step tracking in `onboarding_state` table
✅ Profile collection (business_name, website, timezone)
✅ Progress indicators

#### **What's Broken**
❌ CRM step doesn't call CRM connect flow
❌ KB ingestion step not linked to embed API
❌ No validation that steps completed before "done"
❌ Autopilot toggle not gated by onboarding completion

---

## ✅ **ACCEPTANCE CRITERIA MAPPING**

| Requirement | Current State | Blocker | Fix Priority |
|-------------|---------------|---------|--------------|
| Connect CRM works end-to-end | ⚠️ Partial | Connection save fails | 🔴 P0 |
| GHL selectable & functional | ❌ Missing | Not in Nango config | 🔴 P0 |
| Import creates classified leads | ⚠️ Partial | Missing lead_type column | 🟡 P1 |
| Enrichment fields populated | ❌ Missing | Schema + sync logic | 🟡 P1 |
| AI Texter ON sends first batch | ✅ Works | None | 🟢 ✓ |
| Threads show full convo | ✅ Fixed | None (recent fix) | 🟢 ✓ |
| Threads show contact panel | ❌ Missing | UI component | 🟡 P1 |
| Reminders are context-aware | ⚠️ Partial | Use AI followups only | 🟡 P1 |
| Reminders stop on booking | ❌ Missing | Logic not implemented | 🟡 P1 |
| Replies KPI accurate | ✅ Fixed | None (recent fix) | 🟢 ✓ |
| Delivered % accurate | ✅ Fixed | None (recent fix) | 🟢 ✓ |
| Bookings KPI shown | ❌ Missing | Query not implemented | 🟡 P1 |
| No duplicate sends | ✅ Works | None | 🟢 ✓ |
| Opt-out honored everywhere | ✅ Works | None | 🟢 ✓ |

---

## 🛠️ **IMPLEMENTATION PLAN**

### **Phase 1: CRM Connect (Critical Path) — 1-2 days**

#### **Task 1.1: Fix Nango OAuth Storage**
```typescript
// Create new table: crm_connections
CREATE TABLE IF NOT EXISTS public.crm_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  provider TEXT NOT NULL, -- 'hubspot', 'salesforce', 'gohighlevel', etc.
  nango_connection_id TEXT NOT NULL UNIQUE,
  connection_metadata JSONB,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update app/api/crm/connect/route.ts to save here instead of user_data
```

#### **Task 1.2: Add GoHighLevel Support**
1. Nango Dashboard:
   - Add `gohighlevel` provider config
   - OAuth scopes: `contacts.readonly conversations.readonly locations.readonly`
   - Test with GHL sandbox account

2. Code updates:
```typescript
// app/api/crm/session-token/route.ts
const CRM_INTEGRATIONS = ['hubspot', 'salesforce', 'zoho-crm', 'gohighlevel'];

// lib/crm/gohighlevel.ts (new file)
export class GoHighLevelAdapter implements CRMAdapter {
  async syncContacts(token: string): Promise<CRMContact[]> {
    // Implement GHL API calls
  }
}

// lib/crm/factory.ts
case 'gohighlevel': return new GoHighLevelAdapter();
```

3. UI:
```typescript
// app/components/CRMIntegrations.tsx
// Add GHL logo and selection option
```

#### **Task 1.3: Improve Error Handling**
- Add specific error messages for each failure point
- Show connection status details in UI
- Log errors to monitoring system

---

### **Phase 2: Lead Classification & Enrichment — 2-3 days**

#### **Task 2.1: Schema Migration**
```sql
-- sql/lead_enrichment.sql
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS lead_type TEXT CHECK (lead_type IN ('new', 'old')),
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS crm_id TEXT,
  ADD COLUMN IF NOT EXISTS crm_source TEXT,
  ADD COLUMN IF NOT EXISTS crm_stage TEXT,
  ADD COLUMN IF NOT EXISTS crm_owner TEXT,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_crm_id ON public.leads(crm_id) WHERE crm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_lead_type ON public.leads(lead_type) WHERE lead_type IS NOT NULL;
```

#### **Task 2.2: Update CRM Sync Logic**
```typescript
// app/api/crm/sync/route.ts:84-127
const leadData = {
  name: contact.name,
  phone: contact.phone,
  email: contact.email || null,
  account_id: accountId,
  status: 'pending',
  
  // NEW FIELDS:
  company: contact.company || null,
  role: contact.role || contact.title || null,
  crm_id: contact.id,
  crm_source: providerConfigKey,
  crm_stage: contact.stage || contact.dealStage || null,
  crm_owner: contact.owner || null,
  last_activity_at: contact.lastActivityDate || null,
  lead_type: classifyLead(contact, existingLead),
};
```

#### **Task 2.3: Implement Classification Logic**
```typescript
// lib/crm/classify.ts (new file)
export function classifyLead(
  contact: CRMContact, 
  existing?: Lead
): 'new' | 'old' {
  if (!existing) return 'new';
  
  const hasOutboundHistory = !!existing.last_sent_at;
  const hasInboundHistory = !!existing.last_inbound_at;
  const hasCRMActivity = !!contact.lastActivityDate;
  
  return (hasOutboundHistory || hasInboundHistory || hasCRMActivity) 
    ? 'old' 
    : 'new';
}
```

---

### **Phase 3: Threads Contact Panel — 1 day**

#### **Task 3.1: Update Threads API**
```typescript
// pages/api/threads/[phone].ts — already returns lead data
// Just need to select enrichment fields:
const { data: lead } = await supabaseAdmin
  .from('leads')
  .select('id, name, phone, email, company, role, crm_id, crm_source, crm_stage, crm_owner, lead_type, opted_out, booked, appointment_set_at, last_activity_at')
  .eq('phone', phone)
  .maybeSingle();
```

#### **Task 3.2: Build Contact Panel Component**
```typescript
// app/components/ContactPanel.tsx (new file)
export default function ContactPanel({ lead }: { lead: Lead }) {
  return (
    <div className="p-4 border-l border-slate-200 w-80">
      {/* Name, phone, email */}
      {/* Company, role */}
      {/* CRM details */}
      {/* Status badges */}
      {/* Link to CRM */}
    </div>
  );
}
```

#### **Task 3.3: Update ThreadsPanel**
```typescript
// app/components/ThreadsPanel.tsx
// Add ContactPanel to modal layout
<div className="flex">
  <div className="flex-1">{/* Messages */}</div>
  <ContactPanel lead={conversation.lead} />
</div>
```

---

### **Phase 4: Context-Aware Reminders — 2 days**

#### **Task 4.1: Consolidate Reminder Systems**
- **Decision**: Use AI Followups system (`/api/internal/followups/tick`) as canonical
- Deprecate template-based scheduler
- Keep cron for triggering, but delegate to AI followups

#### **Task 4.2: Implement Conversation Death Detection**
```typescript
// lib/agent/conversation.ts (new file)
export async function isConversationAlive(leadId: string): Promise<boolean> {
  const { data: lead } = await db
    .from('leads')
    .select('last_inbound_at, last_sent_at')
    .eq('id', leadId)
    .single();
  
  const daysSinceInbound = lead?.last_inbound_at
    ? daysBetween(new Date(lead.last_inbound_at), new Date())
    : Infinity;
  
  const CONVERSATION_TIMEOUT_DAYS = 3; // Configurable
  return daysSinceInbound < CONVERSATION_TIMEOUT_DAYS;
}
```

#### **Task 4.3: Add Booking Stop Logic**
```typescript
// /api/internal/followups/tick/route.ts:80+
// Before generating reminder:
const { data: lead } = await db
  .from('leads')
  .select('booked, appointment_set_at, opted_out')
  .eq('id', lead_id)
  .single();

if (lead.opted_out) {
  results.push({ lead_id, skipped: true, reason: 'opted_out' });
  continue;
}

if (lead.booked && lead.appointment_set_at) {
  results.push({ lead_id, skipped: true, reason: 'booked' });
  continue;
}

if (await isConversationAlive(lead_id)) {
  results.push({ lead_id, skipped: true, reason: 'conversation_active' });
  continue;
}
```

---

### **Phase 5: Complete KPIs — 1 day**

#### **Task 5.1: Add Missing Metrics**
```typescript
// pages/api/metrics.ts additions:

// Bookings
const qsBooked = `booked=eq.true&appointment_set_at=gte.${since}`;
const bookings = await count('leads', qsBooked);

// Contacted (unique leads with outbound)
const { data: outboundLeads } = await supabase
  .from('messages_out')
  .select('lead_id')
  .gte('created_at', since);
const contacted = new Set(outboundLeads?.map(m => m.lead_id)).size;

// Opt-outs
const qsOptedOut = `opted_out=eq.true&updated_at=gte.${since}`;
const optOuts = await count('leads', qsOptedOut);

// Reply Rate
const replyRate = contacted > 0 ? replies / contacted : 0;

return {
  kpis: {
    newLeads,
    messagesSent,
    deliveredPct,
    replies,
    bookings,          // NEW
    contacted,         // NEW
    optOuts,           // NEW
    replyRate,         // NEW
  }
};
```

#### **Task 5.2: Update Dashboard UI**
```typescript
// app/(app)/dashboard/components/KpiCards.tsx
// Add new cards for Bookings, Reply Rate, Opt-out Rate
```

---

### **Phase 6: Onboarding Integration — 1 day**

#### **Task 6.1: Connect CRM Step**
```typescript
// app/onboarding/page.tsx
// Add CRM connection component on 'imports' step
{s.step === 'imports' && (
  <div>
    <h2>Connect Your CRM</h2>
    <CRMIntegrations
      onConnect={async () => {
        await saveState({ crm_connected: true, step: 'kb' });
      }}
    />
  </div>
)}
```

#### **Task 6.2: KB Ingestion Step**
```typescript
// Add KB article input on 'kb' step
{s.step === 'kb' && (
  <div>
    <h2>Train Your AI</h2>
    <textarea placeholder="Paste FAQ, pricing, services..." />
    <button onClick={async () => {
      await embedKnowledge(accountId, content);
      await saveState({ kb_ingested: true, step: 'done' });
    }}>
      Process & Continue
    </button>
  </div>
)}
```

#### **Task 6.3: Completion Gates**
```typescript
// Prevent AI Texter activation until onboarding done
const { data: onboarding } = await db
  .from('onboarding_state')
  .select('step, crm_connected, kb_ingested')
  .eq('account_id', accountId)
  .single();

if (onboarding.step !== 'done') {
  return { error: 'Complete onboarding first' };
}
```

---

## 📊 **SUCCESS METRICS**

### **Key Results**
- ✅ CRM connect success rate: >95%
- ✅ Lead import accuracy: 100% (all phones normalized, classified)
- ✅ Threads show all messages: 100% (no gaps)
- ✅ Reminder stop on booking: 100%
- ✅ Dashboard KPIs match actual data: ±2% variance

### **Testing Checklist**
- [ ] Connect HubSpot → see connection saved
- [ ] Connect Salesforce → see connection saved
- [ ] Connect Zoho → see connection saved
- [ ] Connect GHL → see connection saved
- [ ] Import 100 leads → see all classified (new/old)
- [ ] Import includes company, role → visible in threads
- [ ] View thread → see contact panel with all enrichment
- [ ] Lead books → reminders stop
- [ ] Lead opts out → reminders stop
- [ ] Lead replies → reminders pause
- [ ] Dashboard shows bookings count
- [ ] Dashboard shows reply rate
- [ ] New user completes onboarding → CRM connects → leads import → AI turns on → first batch sends

---

## 🚨 **KNOWN RISKS & MITIGATIONS**

### **Risk 1: Schema Changes Break Existing Queries**
**Mitigation**: All new columns are nullable; old queries still work

### **Risk 2: Nango Rate Limits on Sync**
**Mitigation**: Implement batch sync with pagination; add retry logic

### **Risk 3: GHL OAuth Scopes Too Restrictive**
**Mitigation**: Start with read-only scopes; upgrade only if needed

### **Risk 4: Reminder Consolidation Breaks Existing Flows**
**Mitigation**: Keep old schedulers dormant; feature-flag new system

---

## 📝 **NEXT STEPS**

1. **Immediate (P0)**: Fix CRM connect save logic + add GHL
2. **Week 1**: Schema migration + lead classification
3. **Week 2**: Threads contact panel + reminder consolidation
4. **Week 3**: Complete KPIs + onboarding integration
5. **Week 4**: End-to-end testing + documentation

---

## 📚 **RELATED DOCUMENTATION**
- `DIAGNOSTIC_FIXES.md` — Recent threads & KPI fixes
- `SMS_SYSTEM_IMPLEMENTATION.md` — AI texter system
- `PR_SUMMARY.md` — Latest deployment notes
- `DB_SCHEMA.sql` — Current database schema

---

**Last Updated**: 2025-10-29  
**Status**: Ready for Implementation  
**Estimated Total Effort**: 8-10 days (1 developer)

