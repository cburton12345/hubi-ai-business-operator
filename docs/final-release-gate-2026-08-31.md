# Ferocity final release gate — 2026-08-31

## Decision

**READY for one owner-authorized controlled deployment.**

The local release candidate has no known code, build, migration-validity, tenant-isolation, billing-configuration, or public-page blocker. No deployment or remote push was performed during this gate.

One database migration is intentionally pending because it belongs to the unreleased connector-health and inbound-reply code:

- `203_inbound_reply_policy.sql`

Apply migration 203 as part of the authorized cutover, before certifying the new inbound SMS reply controls. Do not represent those controls as production-live until that migration and the post-deploy tests pass.

## Local evidence completed

- Full suite: **127 test files / 467 tests passed**.
- Billing and safety focus: **7 files / 36 tests passed**.
- Auth, workspace access, employee safety, billing access, device authentication, OAuth, and tenant SMS focus: **8 files / 29 tests passed**.
- TypeScript: passed.
- ESLint: passed.
- Optimized production build: passed; **99 static pages generated** and all application/API routes built.
- Public company-data leak guard: passed.
- Provider-truth guard: passed across 30 providers.
- UI quality guard: passed across **272 routes**, 232 component files, and 60 unique All Tools destinations.
- Feature integration check: **42 connected workflows passed**.
- Production readiness: passed with **203 migrations** and 116 required files.
- Provider lanes: all **14 capability groups passed**.
- RLS: tenant-table coverage and sensitive-table grants passed.
- Local runtime smoke/load: 120 requests at concurrency 12, zero failures, 77.8 requests/second, p95 584 ms, p99 689 ms.
- Workflow health: 54 active agent workflows, zero missing next runs, zero failed last runs, zero stuck runs, and zero failed/blocked actions in the prior 24 hours.
- Capacity snapshot: 10/60 database connections, zero recent errors, zero active alerts.

## Public experience audit

The following local production pages were inspected at desktop and phone widths:

- Home
- Features
- Pricing
- Start Ferocity
- Ferocity Connect
- Login
- Terms
- Privacy
- SMS Terms
- SMS opt-in
- Support

Findings:

- No horizontal overflow was found.
- Primary headings, calls to action, and destinations are present.
- Start remains progressive rather than demanding full setup immediately.
- Ferocity Earn appears on Pricing and Start with the same `$0/month` base and `0.9%`/`6%` non-stacking explanation.
- Starter, Growth, and Operator show 25, 100, and 300 included managed voice minutes and `$0.25` per completed overage minute.
- Ferocity Connect is shown as included with each monthly full plan and available standalone for `$29/month` for one Android device, with `$10/month` additional devices.
- The SMS service-consent checkbox is unchecked and required; separate marketing consent is unchecked and optional.
- Public provider-dependent claims retain setup, connection, approval, and safety qualifiers.

## Billing and margin protection

Verified:

- Seven live Stripe prices are readable: Job Tracker, Calls, Connect, Starter, Growth, Operator, and the one-time AI Growth Report.
- A live-mode checkout was created and expired without payment.
- The complete customer-path smoke created and then removed an isolated workspace, invite, leads, grader report, and owner events; it also created and expired a Starter checkout without payment.
- Stripe Connect reports card payments active, payouts active, zero current/past-due requirements, and no database drift.
- Paid actions use plan entitlements, usage limits, provider readiness, approval/consent rules, and cost controls.
- A failed subscription payment enters a seven-day full-service recovery period rather than immediately interrupting a customer.
- From day 7 through day 14, new paid actions and managed spend pause while workspace data and billing access remain available.
- At day 15, paid automation remains suspended until payment recovery; customer data access remains preserved.
- A successful later invoice restores active status immediately.
- Customers and the platform owner receive deduplicated failed-payment/recovery alerts without exposing card information.

Still requiring one controlled production subscription lifecycle test after deployment:

- initial paid checkout and workspace entitlement;
- receipt and webhook reconciliation;
- portal access;
- renewal;
- plan change;
- cancellation;
- refund;
- failed payment, recovery window, restricted state, and restoration.

## Current external/provider truth

These do not block the core controlled release because they are not represented as universally live:

- Meta official connection lacks `META_BUSINESS_LOGIN_CONFIG_ID`.
- Yahoo is unconfigured.
- Optional Twilio SMS remains unavailable/suspended.
- Microsoft Advertising advertiser identity still requires owner completion.
- Jobber QA authorization/write expansion, TikTok production scopes, and other provider approvals remain capability-specific gates.
- Telnyx, SignalWire, Vonage, Sinch, and other managed telecom work remains optional/provider-bound.
- The current UptimeRobot health monitor/status page is sufficient; do not create a duplicate.

## Remembered owner-only item

- Store one encrypted Android signing-key recovery copy outside the current Windows/OneDrive identity. The existing copies are encrypted but share the same identity failure domain.

## Required deployment sequence

1. Confirm the exact release commit and connected Netlify/Supabase production targets.
2. Apply migration 203 transactionally and rerun pending-migration plus RLS checks.
3. Deploy the application/frontend once.
4. Run the public route, auth redirect, health, robots, sitemap, canonical, and responsive smoke checks.
5. If a provider lane fails, disable/isolate that lane; do not take down the platform.

## Required post-deployment certification

Record timestamp, tenant/workspace, provider event/reference, result, and corrective action for every test.

### 1. Public conversion and search

- Verify Home, Features, Demo, Pricing, Start, Connect, login/signup, legal, SMS opt-in, support, `robots.txt`, and `sitemap.xml`.
- Click every primary CTA and verify Pricing, Start, Earn, included usage, and overages agree.
- Confirm public canonical URLs use `https://ferocity.live`, public pages remain indexable, and app/API routes remain protected.
- Confirm Search Console and Bing can fetch the sitemap and Googlebot/Bingbot are not blocked.

### 2. Subscription billing

- Complete the controlled lifecycle listed in “Billing and margin protection.”
- Confirm new-paid-customer and failed-payment owner alerts.
- Confirm grace/restriction/suspension preserves data while stopping new cost-generating work at the intended thresholds.

### 3. Ferocity Connect SMS

- Pair a fresh eligible Android device through the normal customer flow.
- Test queued, sent, provider/device delivered or honestly unknown, failed, rejected, inbound, STOP, START, HELP, consent, quiet hours, rate limits, retry, offline recovery, pause, revoke, replacement, and update installation.
- Disconnect the phone long enough to trigger the new owner offline alert; reconnect it and verify the alert resolves.
- Test record-only, prepared-for-review, and guarded automatic inbound reply modes. Automatic mode must still stop for missing consent, suppression, low confidence, risk, sensitive topics, or unhealthy provider state.

### 4. Facebook assisted connector

- Install the Ferocity-specific connector package and pair it to a single isolated tenant.
- Verify inbound capture, Business Brain reply draft, human approval, one outbound send, failure reporting, checkpoint/restriction detection, watcher-closed offline alert, recovery, and token revocation.
- Confirm the timeline says browser send confirmed rather than delivered/read unless trustworthy Facebook evidence exists.
- Confirm no H4R token, tenant, or production connector flow is shared.

### 5. Email and Message Health

- Enable supported Resend sent/delivered/delayed/bounced/failed/suppressed events only after the new deployed handler is reachable.
- Send one production message and verify exact body/history, normalized receipts, safe errors, retry controls, deduplication, and owner alert behavior.

### 6. Retell voice

- Verify inbound greeting, normal hang-up, transcript, summary, cost, and support record.
- Call the displayed number back and confirm a useful experience rather than silence.
- Ask for a person and confirm a callback request is recorded without falsely promising a transfer.
- Certify two-tenant routing before broad customer traffic.
- Verify outbound queuing respects the configured 20-call ceiling, gives a reasonable estimate when queued, and isolates tenant/provider failures.

### 7. Google, Microsoft, analytics, and admin operations

- Connect, disconnect, revoke, and reconnect clean Google and Microsoft customer accounts; verify encrypted tenant-scoped tokens and graceful degradation.
- Complete Microsoft advertiser identity separately before calling Microsoft Ads launch-ready.
- Verify privacy-conscious visit, signup, paid conversion, and support analytics.
- Trigger support, payment, funding, capacity, automation-failure, connector-offline, and provider-request alerts; confirm resolution stops repeated notifications.

### 8. Field Team and failure isolation

- Verify business and Field Team sign-in destinations, authorized view switching, worker isolation, assignments, time, location, work performed, mileage, costs, proof, advances, English/Spanish, offline recovery, invitations, and cross-tenant denial.
- Inject one controlled provider failure and confirm unrelated providers, tenants, and core pages continue working.

## Final boundary

This evidence supports a controlled launch, not an unqualified claim that every optional external provider has been approved and live-certified. The core release may proceed after explicit deployment authorization. The post-deployment list must be completed before broad traffic or stronger provider-specific claims.
