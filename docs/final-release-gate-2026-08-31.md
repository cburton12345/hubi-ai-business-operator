# Ferocity final release gate — 2026-08-31

## Decision

**READY for one owner-authorized controlled deployment.**

The local release candidate has no known code, build, migration-validity, tenant-isolation, billing-configuration, or public-page blocker. No deployment or remote push was performed during this gate.

Two database migrations are intentionally pending because they belong to unreleased code:

- `203_inbound_reply_policy.sql`
- `204_h4r_ferocity_connect_bridge.sql`

Apply migrations 203 and 204 in order as part of the authorized cutover. Do not represent the inbound SMS reply controls or H4R bridge as production-live until the migrations and their post-deploy tests pass.

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

- Meta Business Login configuration `2301498587321705` is completed and staged in Netlify production. It will become available to the deployed callback on the next authorized deploy. The app remains unpublished and limited to administrator/testing access until Meta's Tech Provider/App Review requirements are completed.
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
2. Apply migrations 203 and 204 transactionally and rerun pending-migration plus RLS checks.
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

## Current-production certification completed after this gate

The owner asked to certify everything possible against the recently deployed production version before the next final deployment. The following checks were completed against `https://ferocity.live` without deploying or pushing code:

- Production launch smoke passed for Home, Features, Automations, Integrations, Connect Website, Demo, Tour, Pricing, Start, Signup, Install, Business Health Score, Login, password reset, health, protected-app redirect, and a live public worker intake route.
- A production customer-path smoke created an isolated workspace, invite, lead sources, active form, grader report, leads, owner events, and a live Starter checkout; the checkout was expired without payment and every smoke record was removed.
- Production website chat created a lead, two-way conversation, guarded human handoff, and owner event; every smoke record was removed.
- Current Home, Pricing, Start, Connect, Login, SMS opt-in, and Support pages were inspected at phone width with no horizontal overflow and no browser warnings or errors.
- `robots.txt` returns 200, allows the public site, disallows app/API/account paths, and references the correct sitemap.
- `sitemap.xml` returns 200 and contains all 24 intended public URLs, including Support and the legal/SMS pages.
- Googlebot and Bingbot user-agent requests return 200.
- The checked public pages have no `noindex` meta tag or `X-Robots-Tag: noindex` header.
- Home, Features, Pricing, Start, Connect, Terms, Privacy, SMS Terms, and SMS opt-in have the correct production canonical URL.
- Production provider readiness, 14 provider-lane groups, seven Stripe prices, Stripe Connect, Retell inbound routing/callback evidence, workflow health, and capacity passed.
- Stripe Connect still reports card payments and payouts active with no current or past-due requirements.
- Retell currently has 0/20 calls active, five reserved inbound slots, a routine outbound soft limit of 15, and a per-tenant limit of two. Live transfer remains correctly disabled because no tenant transfer destination/tool is configured.
- Capacity remained healthy at 14/60 database connections, zero recent errors, zero failed actions, and zero active alerts.

### Issues found and prepared for the next deployment

- Production `/support` incorrectly inherited the homepage canonical. The local page now declares `https://ferocity.live/support`, and the render smoke permanently checks expected canonicals and rejects accidental `noindex` on public legal/support pages.
- Ask Ferocity is now the first primary workspace destination and opens as an outcome-first conversation rather than a tool inventory. It uses saved industry context, asks only for missing context, narrows broad goals such as making more money, runs the existing guarded business scans, and links each result to the correct detailed workspace. Dashboards remain available as the full Command Center.
- Jobber is not currently OAuth-ready and TikTok's access/refresh path is expired. Both remain optional and disabled; neither may be represented as live until reauthorized and certified.
- A remote production load test was deliberately not forced because the repository guard allows remote load testing only against an explicitly approved preview environment. The local release load gate already passed with zero failures.

### Work that must wait for the next deployment

- Migration 203 and the new SMS reply-mode/offline-alert behavior.
- Migration 204 and the locally completed H4R signed SMS bridge.
- Ferocity Facebook connector pairing, heartbeat, timeline, failure, and approval-send certification.
- The corrected Support canonical smoke.
- Resend's expanded delivery-event webhook subscriptions against the new handler.

The combined local rerun below supersedes the earlier separate-task note.

## Final combined local rerun — 2026-09-02

The H4R work was reviewed and completed in the combined Ferocity checkout. No deployment or push was performed.

### Passed now

- Full suite: **129 test files / 474 tests passed**.
- TypeScript and full ESLint: passed.
- Optimized production build: passed; **100 static pages generated**, including the new signed H4R ingress route.
- Production readiness: passed with **204 migrations** and 116 required files.
- Pending migration validation: migrations 203 and 204 passed without being persisted.
- RLS and sensitive-table grant verification: passed.
- Provider truth, all 14 provider-lane groups, public claim guard, public data guard, UI guard, and 42-workflow integration guard: passed.
- Current production launch smoke: passed across all public buying pages, health, protected-app redirect, and a live worker intake route.
- Local runtime/load gate: 120 requests at concurrency 12, zero failures, 68.2 requests/second, p95 799 ms, p99 905 ms.
- Stripe: all seven live prices readable; a live checkout was created and expired without payment.
- Stripe Connect: card payments and payouts active, no current/past-due requirements, no database drift.
- Workflow health: 54 active workflows, zero failed/stuck runs and zero failed/blocked actions in the prior 24 hours.
- Capacity: 10/60 database connections, zero recent errors, zero failed actions, zero active alerts.
- Retell: inbound/fallback routing and real callback evidence remain ready; 0/20 concurrent calls at check time.
- Facebook connector package readiness: passed with tenant-specific `ferocity` destination and no H4R production references.
- H4R bridge safety: signed timestamp/nonce/HMAC ingress, mapped tenant/callback only, active-only live sending, canonical idempotency, normalized recipient, required structured consent evidence, preserved revocations, full diagnostic body redaction, HTTPS callback restriction, callback retries/owner alerting, inbound/status callbacks, and RLS/revoked browser grants. Focused H4R tests passed.

### Known non-core provider limitations (truthfully disabled)

- Jobber customer OAuth is not currently ready: the saved access credential is expired, the current runtime reports no client configuration, and live actions remain off.
- TikTok access/refresh is expired or invalid; production actions must stay disabled until a clean authorization is completed.
- Meta's client configuration now passes readiness and is staged for the next authorized deploy, but third-party customer access remains disabled until Meta review/publishing is completed; Yahoo remains unconfigured.
- Call-log bridge contract is ready, but no Jobber, GoHighLevel, or Housecall Pro bridge is configured/certified yet.
- The flagship demo has a working static fallback; the final approved video override is not configured.

These are not hidden launch defects: the provider-truth layer keeps them out of live claims and actions. They can be activated independently after account approval and certification without making the core platform fail.

### Items that cannot honestly be completed before the authorized deployment

1. Apply migrations 203 and 204 to the production database.
2. Deploy the exact reviewed commit once.
3. Complete one real paid subscription lifecycle with a controlled payment instrument: checkout, entitlement, receipt/webhook, portal, renewal/plan change, cancellation/refund, failed-payment recovery, restriction, and restoration.
4. Re-pair a fresh Android phone and certify Connect queued/sent/delivery-or-unknown/failure/inbound/STOP/HELP/offline/recovery/revoke/update behavior against the deployed code.
5. Pair and certify the Ferocity Facebook connector in an isolated live tenant.
6. Enable and certify the expanded Resend delivery-event webhook against the deployed handler.
7. Certify two-tenant Retell routing and each tenant's own transfer/callback destination; transfer remains correctly unavailable where no destination is configured.
8. Complete real-device Field Team English/Spanish, permissions, offline sync, proof, time/location, advance, and cross-tenant-denial tests.
9. Run the approved preview/production load test and then the public route, canonical, robots, sitemap, CTA, responsive, auth, and failure-isolation smoke suite.
10. Complete Microsoft advertiser identity and any optional provider OAuth/approval steps that require the owner or provider.

Do not call the H4R bridge, expanded inbound-reply modes, new Facebook connector, or optional expired OAuth providers production-certified before those applicable post-deployment tests pass.
