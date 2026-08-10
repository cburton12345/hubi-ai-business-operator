# Ferocity launch capacity and resilience gate

Status: implemented locally; database migrations applied; application code not deployed.

## What is protected now

- Database pools are bounded per serverless instance and use connection, query, statement, idle, and transaction timeouts.
- AI, Stripe, Twilio, Retell, Vapi, and TikTok calls use a shared provider deadline rather than waiting indefinitely.
- Safe provider reads retry brief 429/5xx failures with bounded backoff. Writes retry only when an idempotency key makes repetition safe.
- Public website chat has a six-second AI deadline and returns its useful deterministic intake response when the provider is slow.
- Each serverless instance limits simultaneous AI requests; overload receives a safe fallback instead of consuming every worker.
- Scheduled business automation dispatches a 15-minute Netlify background function instead of trying to finish tenant work inside the 30-second scheduled-function limit.
- The worker uses an expiring database lease so two runs cannot overlap, rotates through due tenants in bounded batches, limits tenant concurrency, and isolates tenant failures.
- The automation maintenance pass deletes expired rate-limit rows in bounded batches.
- Capacity snapshots and alerts now cover database connection pressure, due-action backlog, failed/blocked actions, and recent application errors.
- System Health surfaces those signals with direct Supabase, Netlify, Resend, and provider-cost links so the owner can upgrade before a hard limit interrupts customers.
- A reusable load-test command refuses to target a remote environment unless remote testing is explicitly approved.

## Local verification completed

- TypeScript: passed.
- ESLint: passed.
- Production build: passed; 67 static pages generated.
- Full tests: 64 files / 226 tests passed.
- Netlify's local production build passed and bundled both automation functions.
- Baseline load gate: 160 requests, concurrency 12, zero failures, p95 733 ms.
- Higher local load gate: 400 requests, concurrency 30, zero failures, p95 952 ms, 116.1 requests/second.

These numbers validate the application build on this machine. They do not claim a production capacity limit because Netlify and Supabase plan quotas, geographic latency, cold starts, provider quotas, and real production data volumes differ.

## Required deployment sequence

1. Migrations `163_runtime_capacity_leases.sql` and `164_platform_capacity_monitoring.sql` were applied to production on 2026-08-01; RLS and sensitive-table grants passed afterward.
2. `DATABASE_POOL_MAX=3`, `AI_MAX_CONCURRENT_REQUESTS=6`, `AUTOMATION_TENANT_BATCH_SIZE=50`, `AUTOMATION_AGENT_BATCH_SIZE=50`, and `AUTOMATION_TENANT_CONCURRENCY=2` are staged in Netlify production configuration.
3. Deploy once after all frontend and integration work is ready.
4. Run normal production smoke checks.
5. Run `npm run launch:load` against a private preview first.
6. Run an approved, conservative production test outside peak customer hours.
7. Complete live tests for Stripe, Jobber, Retell, Twilio/BYO, email, calendar, Google AI/Veo, and enabled advertising providers.

### Load-test modes

- Public/static: use the default `npm run launch:load` command.
- Dynamic reads: set `LOAD_TEST_PATHS` to health, login, start, and other non-mutating routes.
- Authenticated reads: supply a dedicated QA session through `LOAD_TEST_HEADERS_JSON`; never use an owner's production session.
- Mutating API paths: use a seeded preview only and explicitly set `ALLOW_MUTATING_LOAD_TEST=true`.
- Checkout, messaging, voice, video, advertising, and provider webhooks receive low-volume scenario tests rather than indiscriminate load. Their provider-side quotas and idempotency records must be verified separately.

## Launch acceptance gates

- Zero 5xx responses during the approved smoke and load suites.
- Public p95 response time below two seconds for cached/static pages and below five seconds for ordinary dynamic actions.
- Public chat always responds within eight seconds, including provider failure.
- Duplicate webhooks do not create duplicate payments, messages, calls, or jobs.
- Automation overlap attempts return `skipped: true` instead of starting a second run.
- Database connection use stays below the Supabase pooler limit with at least 30% headroom.
- Provider 429s, timeouts, and funding failures create visible alerts without taking unrelated features offline.

## Scale-up triggers

- At 50 active businesses: review Supabase connection and slow-query metrics weekly.
- At 200 active businesses: review worker duration, due-action backlog, and tenant rotation; add a managed queue if a 15-minute run or bounded batches approach their safe operating margin.
- At 500 active businesses: use dedicated production observability, synthetic probes, and provider-specific circuit-breaker dashboards.
- Increase provider budgets, rate limits, and database capacity from measured usage, not from customer-facing hard limits that reduce value.
