# Dashboard Design Changes Plan

## Overview
This document outlines all the design changes made to the dashboard to create a consistent, modern UI with frosted glass cards and a deep purple gradient background.

## Key Design Elements

### 1. Dashboard Background
- **Gradient**: `bg-gradient-to-b from-indigo-900 via-indigo-800 to-slate-900`
- **Text Color**: White (`text-white`)

### 2. Dashboard Header
- **Title**: "Dashboard" - `text-4xl md:text-5xl font-bold text-white`
- **Subtitle**: "Track outreach performance, specific conversations, and more." - `text-lg text-white/80 mt-3`
- **Removed**: "Live Performance Dashboard" card (if it exists)

### 3. Card Components

#### StatCard (KPI Cards - New Leads, Contact, Replies, etc.)
- **Background**: `bg-white/20 backdrop-blur-xl`
- **Border**: `border border-amber-500/50`
- **Shadow**: `shadow-[0_8px_24px_rgba(0,0,0,0.35)]`
- **Padding**: `px-6 py-5`
- **Border Radius**: `rounded-2xl`
- **Title**: `text-sm font-bold text-white`
- **Value**: `text-3xl font-bold text-white`
- **Subtext**: `text-xs text-white/60`

#### ChartCard (Most Cards - Frosted Glass)
- **Background**: `bg-white/20 backdrop-blur-xl`
- **Border**: `border border-amber-500/50`
- **Shadow**: `shadow-[0_8px_24px_rgba(0,0,0,0.35)]`
- **Padding**: `px-6 py-5`
- **Border Radius**: `rounded-2xl`
- **Title**: `text-sm font-bold text-white mb-4`
- **Content Text**: `text-white/80` or `text-white` depending on context

#### WhiteChartCard (Message Delivery & Lead Engagement Only)
- **Background**: `bg-white`
- **Border**: `border border-amber-500/50`
- **Shadow**: `shadow-[0_8px_24px_rgba(0,0,0,0.35)]`
- **Padding**: `px-6 py-5`
- **Border Radius**: `rounded-2xl`
- **Title**: `text-sm font-bold text-gray-900 mb-4`
- **Description Text**: `text-xs text-gray-700`
- **Empty State**: `text-sm text-gray-700`

### 4. Cards Using Each Style

#### StatCard (KPI Cards):
- New Leads
- Contact
- Replies
- (Any other metric cards)

#### ChartCard (Frosted Glass):
- Monthly SMS Cap
- Quiet Hours
- Top Intents
- Reply Heatmap
- Carrier/Error Breakdown
- Conversion Funnel
- Recent Threads

#### WhiteChartCard (White Background):
- Message Delivery
- Lead Engagement

### 5. Chart Components

#### DeliveryChart
- **Card**: Uses `WhiteChartCard`
- **Description**: `text-xs text-gray-700`
- **Background**: `transparent` (inherits white from card)
- **Legend**: `textStyle: { color: '#1F2937' }` (gray-800)
- **X-Axis Line**: `#6B7280` (gray-500)
- **X-Axis Label**: `#374151` (gray-700)
- **Y-Axis Label**: `#374151` (gray-700)
- **Grid Lines**: `#E5E7EB` (gray-200, dashed)
- **Failed Line**: Red (`#EF4444`)

#### RepliesChart
- **Card**: Uses `WhiteChartCard`
- **Description**: `text-xs text-gray-700`
- **Background**: `transparent` (inherits white from card)
- **X-Axis Line**: `#6B7280` (gray-500)
- **X-Axis Label**: `#374151` (gray-700)
- **Y-Axis Label**: `#374151` (gray-700)
- **Grid Lines**: `#E5E7EB` (gray-200, dashed)

### 6. Conversion Funnel
- **Card**: Uses `ChartCard` (frosted glass)
- **Description**: `text-xs text-white/80`
- **Step Labels**: `text-sm font-semibold text-white`
- **Step Values**: `text-sm font-bold tabular-nums text-white`
- **Progress Bar Background**: `bg-white/10`
- **Progress Bar Fill**: Indigo gradient (or amber for last step)
- **Summary Cards**: `bg-white/10 border border-white/20` (or `border-amber-500/50` for booking rate)
- **Summary Text**: `text-white/80` for labels, `text-white` for values

### 7. Recent Threads
- **Card**: Uses frosted glass styling (same as ChartCard)
- **Background**: `bg-white/20 backdrop-blur-xl`
- **Border**: `border border-amber-500/50`
- **Title**: `text-xl font-bold text-white`
- **Table Headers**: `text-gray-300` or `text-white/80`
- **Table Cells**: `text-white` or appropriate contrast

### 8. Other Card Content Colors

#### Monthly SMS Cap:
- **Text**: `text-white/80`
- **Progress Bar Background**: `bg-white/10`
- **Warning/Error Text**: `text-rose-300` or `text-amber-300`

#### Quiet Hours:
- **Text**: `text-white/80`
- **Links**: `text-white/90 underline hover:text-white`

#### Top Intents:
- **Container**: `border border-white/20`
- **Text**: `text-white/80` for container, `text-white` for items

#### Reply Heatmap:
- **Title**: `text-sm font-semibold text-white`
- **Empty State**: `text-sm text-white/80`

#### Carrier/Error Breakdown:
- **Section Titles**: `text-xs font-medium text-white/90`
- **Container**: `border border-white/20`
- **Text**: `text-white/80` for container, `text-white` for items

## Implementation Steps

1. Update `DashboardClient.tsx`:
   - Change background gradient
   - Update title and subtitle text
   - Remove "Live Performance Dashboard" card if present

2. Create/Update `StatCard.tsx`:
   - Create `StatCard` component
   - Create `ChartCard` component
   - Create `WhiteChartCard` component

3. Update `MetricsPanel.tsx`:
   - Remove "Live Performance Dashboard" card
   - Update all cards to use appropriate component
   - Update text colors throughout

4. Update `KpiCards.tsx`:
   - Use `StatCard` component
   - Ensure proper null coalescing

5. Update `DeliveryChart.tsx`:
   - Use `WhiteChartCard` wrapper (in MetricsPanel)
   - Update chart colors for white background
   - Update description text color

6. Update `RepliesChart.tsx`:
   - Use `WhiteChartCard` wrapper (in MetricsPanel)
   - Update chart colors for white background
   - Update description text color

7. Update `Funnel.tsx`:
   - Use `ChartCard` component
   - Update all text colors to white
   - Update progress bars and summary cards

8. Update `ThreadsPanel.tsx`:
   - Update to use frosted glass styling
   - Update text colors

## Files to Modify

1. `app/(app)/dashboard/DashboardClient.tsx`
2. `app/components/StatCard.tsx` (create if doesn't exist)
3. `app/components/MetricsPanel.tsx`
4. `app/(app)/dashboard/components/KpiCards.tsx`
5. `app/(app)/dashboard/components/DeliveryChart.tsx`
6. `app/(app)/dashboard/components/RepliesChart.tsx`
7. `app/(app)/dashboard/components/Funnel.tsx`
8. `app/components/ThreadsPanel.tsx`

## Notes

- All cards should have amber borders (`border-amber-500/50`)
- Frosted glass cards use `backdrop-blur-xl` for the glass effect
- White cards are only for Message Delivery and Lead Engagement
- All other cards use frosted glass styling
- Ensure proper null coalescing for all data access to prevent runtime errors

