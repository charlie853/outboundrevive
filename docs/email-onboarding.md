# OutboundRevive Email — Client Onboarding (Done-For-You)

Internal guide for onboarding a client to the cold email engine.

## 1. Create / connect sending domain

- Use **Dashboard → Email → Domains** or `POST /api/email/domains` with `{ "domain": "client.com" }`.
- Get DNS records: `GET /api/email/domains/:id/dns` and provide the client with:
  - **SPF** (TXT on root): e.g. `v=spf1 include:_spf.google.com ~all` (adjust for provider).
  - **DMARC** (TXT on `_dmarc.client.com`): e.g. `v=DMARC1; p=none; rua=mailto:dmarc@client.com`.
- After the client adds records, run **Verify**: `POST /api/email/domains/:id/verify`.

## 2. Provision sending inboxes

- Use **Dashboard → Email → Domains** (Inboxes section) or `POST /api/email/inboxes` with:
  - `provider`: `gmail` | `microsoft` | `smtp`
  - `email_address`: the sending address
  - `domain_id`: optional, link to a verified domain
  - `daily_limit`: max sends per day (e.g. 50 during warmup)
  - `credentials_ref`: env var name that holds the OAuth refresh token or SMTP credentials (e.g. `EMAIL_INBOX_xyz_REFRESH_TOKEN`). Store tokens in Vercel env or a secrets manager; never commit.

## 3. Warmup

- MVP uses a **stub** in `lib/email/warmup.ts` (returns a default daily limit).
- To integrate a third-party warmup provider: implement `getWarmupStatus(inboxId)` and `getRecommendedDailyLimit(inboxId)` and optionally store `warmup_status` / `recommended_daily_limit` on `email_sending_inboxes`.
- Ensure each inbox’s `daily_limit` does not exceed the provider’s or warmup recommendation.

## 4. Launch a campaign

1. **Create campaign**  
   `POST /api/email/campaigns` with `{ "name": "Campaign Name", "status": "draft" }`.

2. **Add steps**  
   `POST /api/email/campaigns/:id/steps` for each step, e.g.:
   - `order_index: 0`, `subject_template`, `body_template`, `delay_days: 0` (first step)
   - `order_index: 1`, `subject_template`, `body_template`, `delay_days: 2` (follow-up)

   Use variables like `{{name}}` in subject/body; they are replaced with lead data when sending.

3. **Add leads**  
   - **CSV / manual**: `POST /api/email/leads` with `{ "leads": [ { "email", "name", "company?" } ] }`. Creates or updates leads with email.
   - **CRM**: Use existing CRM sync; ensure leads have `email` set. Then filter by campaign or use the same account.

4. **Assign inboxes to campaign**  
   Campaign `settings` can include `sending_inbox_ids` (array of UUIDs). The queue producer (when implemented in the UI or via internal script) should pick from these inboxes when enqueueing step 1.

5. **Enqueue step 1**  
   For each lead and chosen inbox, call:
   `POST /api/email/send/queue` with:
   `{ "items": [ { "campaign_id", "step_id", "lead_id", "sending_inbox_id" } ] }`  
   (Optional: `run_after` for delayed start.)

6. **Activate campaign**  
   `PATCH /api/email/campaigns/:id` with `{ "status": "active" }`.

7. **Cron**  
   The **email send worker** runs every 5 minutes (`/api/internal/email/worker`, cron). It processes `email_send_queue`, sends via Gmail/Graph/SMTP (when `lib/email/send.ts` is wired with real credentials), records opens and unsubscribes, and enqueues the next step after each send.

## 5. Unibox and replies

- **Unibox**: Dashboard → Email → Unibox lists threads (replies). Open a thread to see messages and send a manual reply.
- **Inbound**: Incoming replies must be ingested via `POST /api/internal/email/inbound` (admin token required). Payload: `account_id`, `from`, `to`, `subject`, `body_plain`, `provider_message_id`, `in_reply_to`. Wire this to Gmail/Graph webhooks or a polling job that fetches new messages and calls this endpoint.

## 6. Subsequences and CRM sync

- **Subsequence rules**: `POST /api/email/campaigns/:id/subsequence-rules` with `trigger_type` (`label` | `keyword`), `trigger_value`, `target_flow` (`stop` or alternate campaign UUID). When a reply is ingested and matches a rule, the event is logged and (if `stop`) pending queue items for that lead are failed.
- **CRM sync**: On reply, the system pushes a note to HubSpot (if CRM is connected) via `lib/email/crm-sync.ts`. Ensure the lead has `crm_id` set (from CRM sync) for reliable association.

## Security and compliance

- Store OAuth refresh tokens and SMTP credentials in env or a secrets manager; reference by `credentials_ref` only.
- Every outbound email must include an **unsubscribe link** (tracking URL `/api/email/t/unsub/:messageId`). The open tracking pixel is `/api/email/t/open/:messageId`.
- Suppression list: `email_suppression` (global and per-account). Unsubscribes and bounces are added here; the worker skips suppressed addresses.

## Key API endpoints (summary)

| Endpoint | Purpose |
|----------|--------|
| `GET/POST /api/email/domains` | List, add domain |
| `POST /api/email/domains/:id/verify` | Verify DNS |
| `GET /api/email/domains/:id/dns` | Suggested DNS records |
| `GET/POST /api/email/inboxes` | List, add sending inbox |
| `GET/POST /api/email/campaigns` | List, create campaign |
| `GET/POST /api/email/campaigns/:id/steps` | List, add step |
| `POST /api/email/send/queue` | Enqueue sends |
| `GET /api/email/unibox` | List threads |
| `GET/PATCH /api/email/unibox/threads/:id` | Thread detail, update labels/assignee |
| `POST /api/email/unibox/threads/:id/reply` | Send manual reply |
| `GET /api/email/stats` | Aggregates |
| `POST /api/internal/email/worker` | Cron: process queue (admin/cron auth) |
| `POST /api/internal/email/inbound` | Ingest reply (admin auth) |
