<!-- a0253da5-17af-4f80-9646-659c162665e7 8d22be33-5955-4bc0-9c67-f2ad7a03210c -->
# Auto Dealer Verticalization Plan

## Phase 0 – Data Foundations

1. Add SQL migrations for the new tables (`vehicles`, `ownerships`, `service_events`, `offers`, `offer_sends`, `scores_next_buy`, `experiments`, `experiment_assignments`, `conv_facts`, `question_policy`, `question_history`) plus supporting indexes/FKs to existing `accounts`/`leads`.
2. Extend existing tables where needed (e.g., `leads` with `preferred_vehicle`/`vehicle_interest`, `appointments` with `service_event_id` FK) to avoid duplicating concepts.
3. Document entity relationships (ERD notes) so engineers see how new tables hook into `leads`, `messages_*`, `appointments`.
4. Introduce an `account_vertical` (enum/text) field on `accounts`/`tenants` to store the selected industry and default nurture content; seed with existing accounts as `general`.

## Phase 1 – Data Ingestion & APIs

1. Implement `POST /api/appointments/import` to ingest dealership scheduler/DMS payloads (CSV/JSON), normalize into `service_events`, and upsert referenced `vehicles`/`ownerships`.
2. Implement `POST /api/ro/update` to update `service_events` rows based on `external_id` (RO open/close timestamps, advisor, services performed, revenue summary).
3. Extend existing `/api/leads/webhook` (or add optional fields) to accept `vehicle_interest`, `vin`, `financed_term_months`, and create/update `vehicles` + `ownerships` accordingly.
4. Create internal admin routes matching cron-style usage: `/api/internal/offers/send`, `/api/internal/scores/recompute`, `/api/internal/experiment/assign` (guarded by admin key) reusing current App Router patterns.

## Phase 2 – Service-Visit Upsell Engine

1. Build a scheduler (cron job or extend existing follow-up enrollment cron) that scans `service_events` for the three trigger windows (T-48h, RO open, T+24h) and queues eligible upsells.
2. Implement offer selection logic: evaluate `offers.rule_json` (vehicle make/model, mileage_band, seasonality, prior declines) and pick a single best offer per trigger; mark the `service_event` phase as sent to prevent duplicates.
3. Reuse existing SMS send pipeline: enqueue via `messages_out` helpers, honor quiet hours/state caps, and log send metadata into `offer_sends` (including experiment variant).
4. Define “acceptance” signals (reply keywords like YES/BOOK, link click tracked via redirect, RO line-items matching offer) and backfill `offer_sends.accepted` + `revenue_attributed` when detected (listener on inbound handler plus optional RO webhook).

## Phase 3 – Ownership Lifecycle Watchlist

1. Create a nightly job (`/api/internal/scores/recompute`) that iterates relevant leads/ownerships and computes `scores_next_buy` using rule-based heuristics (term elapsed %, last service age, `conv_facts` mileage/timing facts, recent interest).
2. Persist `score`, `window` bucket (0-3m / 3-6m / 6-12m), and `reason_json` (human-readable factors) per lead.
3. Add an API endpoint (`/api/watchlist`) and helper queries to fetch top “Next-to-Buy” leads for the dashboard.

## Phase 4 – SMS Micro-Surveys & Data Mining

1. Introduce a micro-survey orchestrator (could run inside follow-up tick or a new cron) that checks per-lead cooldowns (`question_history`) and missing facts (no `conv_facts` for key) before scheduling a micro-survey message.
2. Leverage the existing AI SMS generation path but wrap it with a survey template resolver: choose question from `question_policy` (priority + cooldown) and pass structured context to the LLM so it asks the specific prompt.
3. Parse replies via lightweight NLP/regex, normalize values, and store them in `conv_facts` with confidence + source; update `question_history` with answered status or snooze after two ignores.
4. Ensure micro-surveys respect quiet hours, state caps, opt-outs, and never combine with upsell messages to remain non-spammy.

## Phase 5 – Experiments & Incremental Lift

1. Add experiment configuration UI/API so ops can define holdout % per campaign (e.g., “Service T-48h Upsell – 10% control”).
2. Implement `/api/internal/experiment/assign` (used by the upsell scheduler) to randomly bucket eligible leads and persist assignments in `experiment_assignments` (with campaign + variant).
3. When sending offers, stamp `experiment_id`/`variant` on `offer_sends` (and optionally `messages_out`) so downstream analytics can compare treatment vs control.
4. Extend analytics queries to compute incremental booked/kept/upsell revenue vs control, surfaced via API for dashboard cards.

## Phase 6 – Dashboard & UX Extensions

1. Dashboard cards: add Service Upsell performance (sends, accepts, attributed $), Watchlist counts by window with click-through to leads, Micro-survey coverage (% leads with mileage_band/timing facts), and Experiment lift summaries.
2. Threads view enhancements: show chips for vehicle summary, watchlist bucket, micro-survey tags, and offer attribution; reuse existing card layout.
3. Offer detail panel: allow reps to see latest offer sent, acceptance status, and manual override buttons if needed (future-friendly for medspa/home services).

## Phase 7 – Compliance, QA, and Documentation

1. Reuse existing quiet-hour/state-cap modules for every new send path; add automated tests ensuring upsell/micro-survey sends are blocked when compliance rules hit.
2. Add fixtures + integration tests covering service-event ingestion, offer scheduling, survey ask/reply, score recompute, and experiment reporting.
3. Update runbooks/docs (README sections, TEST-* guides) explaining how to onboard a dealership, import service data, interpret watchlist, and monitor experiments.

## Reuse & Hook-in Notes

- **Existing tables/services**: continue using `leads`, `messages_out`, `messages_in`, `appointments`, AI reply generator, follow-up cron infrastructure, quiet hour/state-cap utilities, opt-out handlers, and dashboard frameworks.
- **Micro-survey hook**: orchestrator feeds into the same SMS drafting pipeline (`generateSmsReply`) but with survey-specific context; responses are captured via the existing inbound webhook (`pages/api/webhooks/twilio/inbound.ts`) before being normalized into `conv_facts`.
- **Compliance guarantees**: every new send path must call the shared compliance gate (quiet hours, state caps, opt-out check) before emitting SMS, and experiments must never override these guards.

### To-dos

- [ ] Ship vertical tables & migrations
- [ ] Build ingestion + admin routes
- [ ] Implement service upsell scheduling
- [ ] Compute and surface lifecycle scores
- [ ] Add SMS data-mining layer
- [ ] Support holdouts & lift calc
- [ ] Extend dashboard/threads UX
- [ ] Compliance tests + docs