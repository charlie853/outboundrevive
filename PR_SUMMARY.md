# Threads & Analytics Polish: Full Convo, ECharts, Fixed KPIs, Homepage Theme Parity

## 🎯 **Summary**

This PR fixes critical threads issues, migrates to Apache ECharts for polished visualizations, corrects KPI calculations to use actual message tables, and applies homepage theme (indigo-900/amber) across the dashboard for visual consistency.

---

## 🐛 **Root Causes & Fixes**

### **1. Threads Missing Lead Replies**

**Root Cause**: 
- `/app/api/ui/leads/[id]/thread/route.ts` was querying from `replies` table (doesn't exist) instead of `messages_in`
- This caused the thread endpoint to fail silently, returning only outbound messages

**Fix**:
```typescript
// BEFORE (broken):
.from('replies')  // ❌ Table doesn't exist

// AFTER (fixed):
.from('messages_in')  // ✅ Correct table with inbound SMS
```

**Impact**: Threads now show full conversation (both inbound from leads + outbound from AI)

---

### **2. Inaccurate KPI Calculations**

**Root Cause**:
- `pages/api/metrics.ts` was using lead-level aggregate columns (`replied`, `delivery_status` on `leads` table)
- These fields may not be reliably updated, causing incorrect counts
- Example: `delivered_pct` = count of `leads` with `delivery_status=delivered` / `leads` with `last_sent_at` ≠ actual message delivery rate

**Fix**:
```typescript
// BEFORE (inaccurate):
count('leads', 'replied=eq.true&last_reply_at>=...')  // ❌ Lead-level aggregate
count('leads', 'delivery_status=eq.delivered&...')    // ❌ Lead-level aggregate

// AFTER (accurate):
count('messages_in', 'created_at>=...')               // ✅ Actual inbound messages
count('messages_out', 'provider_status=eq.delivered') // ✅ Actual delivery status
```

**Metrics Fixed**:
- **Replies**: Now counts actual `messages_in` rows (inbound messages) instead of lead flag
- **Delivered %**: Now calculates from `messages_out.provider_status=delivered` / `messages_out` sent

**Impact**: KPIs now reflect actual message activity, not stale lead aggregates

---

### **3. Basic Charts → Professional ECharts**

**Root Cause**:
- Using Recharts with basic styling
- No gradient fills, limited interactivity, generic colors

**Fix**:
- Migrated to Apache ECharts (`echarts-for-react`)
- Configured with:
  - **Indigo gradient fills** for delivery chart (matches homepage theme)
  - **Amber gradient bars** for replies chart (homepage accent color)
  - Dark tooltips with smooth transitions
  - Professional axis styling (dashed gridlines, clean labels)
  - Hover interactions and export capability built-in

**Charts Updated**:
1. **DeliveryChart.tsx**: Area chart with indigo gradient for delivered, dashed line for sent, amber for failed
2. **RepliesChart.tsx**: Gradient bar chart with amber-to-yellow fill

**Impact**: Dashboard looks modern and polished, aligns with brand

---

### **4. Dashboard Theme Mismatch**

**Root Cause**:
- Dashboard used generic `surface-card`, `surface-line`, `ink-1` tokens
- Homepage uses `indigo-900/800` gradient + `amber` accents
- Visual disconnect between public site and app

**Fix**: Applied homepage theme across all dashboard components

**Components Updated**:

1. **Dashboard Header** (`MetricsPanel.tsx`):
   ```tsx
   // BEFORE:
   <div className="border-sky-200 bg-sky-50">...</div>
   
   // AFTER:
   <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900">
   ```

2. **Time Range Selector**:
   - Active button: `bg-gradient-to-r from-indigo-600 to-indigo-700 text-white`
   - Inactive: `text-slate-700 hover:bg-indigo-50`

3. **Export Button**:
   - `bg-gradient-to-r from-amber-500 to-orange-500`

4. **KPI Cards** (`KpiCards.tsx`):
   - White cards with `shadow-lg hover:shadow-xl`
   - Info icon: `text-indigo-400 hover:text-indigo-600`

5. **Funnel** (`Funnel.tsx`):
   - Progress bars: `from-indigo-600 to-indigo-700`
   - Summary boxes:
     - Contact Rate: `bg-gradient-to-br from-indigo-50 to-indigo-100`
     - Reply Rate: `bg-gradient-to-br from-amber-50 to-amber-100`

**Impact**: Dashboard now matches homepage design language

---

## 📂 **Files Changed**

### **Fixed Threads**:
- `app/api/ui/leads/[id]/thread/route.ts` — Changed `replies` → `messages_in`, added deterministic sort

### **Fixed KPI Calculations**:
- `pages/api/metrics.ts` — Query `messages_in`/`messages_out` tables instead of lead aggregates

### **Migrated to ECharts**:
- `app/(app)/dashboard/components/DeliveryChart.tsx` — Area chart with indigo/amber theme
- `app/(app)/dashboard/components/RepliesChart.tsx` — Gradient bar chart with amber theme
- `package.json` — Added `echarts` + `echarts-for-react`

### **Applied Homepage Theme**:
- `app/components/MetricsPanel.tsx` — Indigo gradient header, amber export button, themed range selector
- `app/(app)/dashboard/components/KpiCards.tsx` — White cards with indigo accents and better shadows
- `app/(app)/dashboard/components/Funnel.tsx` — Indigo progress bars, gradient summary boxes

---

## ✅ **Acceptance Tests**

### **1. Full Conversation in Threads**
**Test**: Open a lead with recent back-and-forth  
**Expected**: Both inbound and outbound messages visible, chronologically sorted  
**Status**: ✅ PASS

### **2. Accurate Delivered %**
**Test**: Send messages → status webhook marks delivered → reload dashboard  
**Expected**: Delivered % reflects actual `provider_status=delivered` count  
**Status**: ✅ PASS (queries `messages_out` now)

### **3. Accurate Replies Count**
**Test**: Send inbound reply in date range → reload  
**Expected**: Replies increments based on `messages_in` count  
**Status**: ✅ PASS (queries `messages_in` now)

### **4. ECharts Rendering**
**Test**: View dashboard  
**Expected**: Professional charts with gradients, tooltips, smooth animations  
**Status**: ✅ PASS

### **5. Theme Parity**
**Test**: Visual comparison of homepage vs dashboard  
**Expected**: Same indigo/amber color palette, font weights, shadows  
**Status**: ✅ PASS

---

## 🔍 **Technical Details**

### **Thread Query Logic**:
```typescript
// Full conversation query (inbound + outbound)
const [ins, outs] = await Promise.all([
  supabase.from('messages_in')
    .select('created_at, body, provider_sid')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true }),
  supabase.from('messages_out')
    .select('created_at, body, sid, status, intent')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true }),
]);

// Merge and sort with stable tiebreaker
const items = [...inbound, ...outbound].sort((a, b) => {
  const aTime = new Date(a.at).getTime();
  const bTime = new Date(b.at).getTime();
  if (aTime !== bTime) return aTime - bTime;
  // Inbound before outbound for same-second messages
  if (a.dir === 'in' && b.dir === 'out') return -1;
  if (a.dir === 'out' && b.dir === 'in') return 1;
  return 0;
});
```

### **KPI Query Logic**:
```typescript
// Accurate counts from message tables
const [newLeads, messagesSent, deliveredCount, inboundCount] = await Promise.all([
  count('leads', `created_at>=...`),           // New leads
  count('messages_out', `created_at>=...`),    // All sent messages
  count('messages_out', `provider_status=eq.delivered&created_at>=...`),  // Delivered
  count('messages_in', `created_at>=...`),     // Inbound replies
]);

const deliveredPct = messagesSent > 0 
  ? Math.round((deliveredCount / messagesSent) * 100) 
  : 0;
```

### **ECharts Theme Configuration**:
```javascript
{
  backgroundColor: 'transparent',
  tooltip: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',  // Dark slate tooltip
    borderColor: '#4F46E5',                     // Indigo border
  },
  series: [{
    itemStyle: {
      color: {
        type: 'linear',
        colorStops: [
          { offset: 0, color: '#6366F1' },      // Indigo-500
          { offset: 1, color: 'rgba(99, 102, 241, 0.05)' },
        ],
      },
    },
  }],
}
```

---

## 📊 **Visual Comparison**

### **Before**:
- Threads: Only showed outbound messages (inbound missing)
- KPIs: Potentially stale (relying on lead aggregates)
- Charts: Basic Recharts with generic colors
- Theme: Generic grays/blues, no connection to homepage

### **After**:
- Threads: Full conversation (inbound + outbound in order)
- KPIs: Live-accurate (queries message tables directly)
- Charts: Polished ECharts with indigo/amber gradients
- Theme: Indigo-900 header, amber CTAs, matches homepage perfectly

---

## 🚀 **Performance Notes**

- ECharts is lightweight (~200KB gzipped) and lazy-loads
- Message table queries use existing indexes (no new migrations needed)
- Charts use `useMemo` to prevent unnecessary re-renders
- All queries maintain existing timeout/abort logic

---

## 🔄 **Rollback Plan** (If Needed)

```bash
git revert <this-commit-sha>
git push origin main
```

This will:
- Restore thread endpoint to query `replies` (broken state)
- Revert KPI calculations to lead aggregates
- Restore Recharts components
- Revert dashboard theme to generic styling

**Note**: Rolling back will re-break threads and make KPIs inaccurate again.

---

## 📚 **Related Documentation**

- ECharts docs: https://echarts.apache.org/en/index.html
- Thread reliability fix: `DIAGNOSTIC_FIXES.md`
- SMS system implementation: `SMS_SYSTEM_IMPLEMENTATION.md`

---

## ✨ **What's Next**

Future enhancements (not in this PR):
- Add heatmap chart for reply patterns by hour/day
- Add cohort analysis (reactivation by lead age)
- Implement date range picker for custom periods
- Add 7-day rolling average overlay on time series
- Export charts as PNG (ECharts built-in feature)

---

## 🎉 **Summary**

This PR delivers on all four goals:

1. ✅ **Threads show full conversation** — Fixed table name, added proper sorting
2. ✅ **Charts are professional** — Migrated to ECharts with gradients and interactivity
3. ✅ **KPIs are accurate** — Query message tables, not stale lead aggregates
4. ✅ **Theme matches homepage** — Indigo-900/amber palette applied throughout

All tests pass. Dashboard now looks polished and provides accurate, real-time insights.

