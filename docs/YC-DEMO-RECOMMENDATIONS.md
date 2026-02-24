# YC Demo: How Reviewers Can See & Test the Product

This doc suggests what to add or do so YC can actually see and test OutboundRevive via the dashboard.

## What’s Already in Place

- **Overview**: KPIs, Lead Engagement chart, Email quick-access card, Export CSV (full + monthly + email stats), “Try the product” hints (Messaging, Unibox, Export CSV).
- **Messaging**: Time range, delivery/reply charts, Recent Threads with View/Refresh/Delete, thread modal with reply.
- **Email**: Campaigns, Leads, Unibox (3-column: sidebar, reply list, read pane), Domains, Stats — all with consistent styling, empty states, and Retry on errors.
- **Appointments / Funnel / Usage**: Metrics and billing surfaced with same patterns.

## Recommended Additions So YC Can Test

1. **Demo or seed data (high impact)**  
   - Add a “Load demo data” or “Try with sample data” on Overview (or a `/demo` route) that seeds a few SMS threads, 1–2 email campaigns, and a handful of email threads so reviewers can click through without connecting real accounts.
   - Alternatively: one-click “Request demo” that creates a demo account and redirects to dashboard with pre-filled sample data.

2. **Short product tour or first-time hint**  
   - Optional 2–3 step tooltip on first visit: “Start here → then try Messaging / Email → Export CSV for the full picture.” Dismissible and stored in `localStorage`.

3. **Clear “value in one sentence” on Overview**  
   - One line under the subtitle, e.g. “SMS + cold email outreach with replies in one place and full metrics export.” Makes the pitch obvious in 5 seconds.

4. **Sign-up / login that’s obvious for reviewers**  
   - Ensure “Sign in” or “Get started” is visible from the dashboard (e.g. in header/shell) so they don’t get stuck on “metrics unavailable” without knowing how to log in.

5. **Stable demo account**  
   - If you don’t use seed data, create a single demo account (e.g. demo@outboundrevive.com) with pre-loaded threads/campaigns and share the credentials in the YC application or in a “Demo login” button so reviewers can test without signing up.

6. **Export CSV as proof of depth**  
   - Keep the Export CSV prominent; it shows the product has real metrics (SMS + email, monthly breakdown) and is more than a static UI.

7. **Unibox and Messaging as “hero” flows**  
   - In the application or a one-pager, point YC to: “Click Messaging → open a thread and reply” and “Click Email → Unibox → open a reply and send” so they see the core loop in under a minute.

## Quick Checklist Before Submitting

- [ ] No console errors or broken layouts on Overview, Messaging, Email (all tabs), Appointments, Funnel, Usage.
- [ ] Export CSV runs and downloads a sensible file (even if mostly zeros).
- [ ] Empty states explain what the section does and what to do next.
- [ ] Retry on errors works everywhere; no dead ends.
- [ ] Either demo data or a shared demo login so reviewers can click through real flows.
