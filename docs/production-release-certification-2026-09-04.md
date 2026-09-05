# Ferocity production release certification — 2026-09-04

## Release identity

- Production URL: `https://ferocity.live`
- Deployed commit: `6da0816b24635fc2582d81fa9053aec2dbf33b14`
- Release tag: `ferocity-release-2026-09-04-212431`
- Netlify deploy: `6a9b9a5f1671758bf79964fa`
- Immutable deploy URL: `https://6a9b9a5f1671758bf79964fa--ferocityflo.netlify.app`
- Database migrations applied: `203_inbound_reply_policy.sql` and `204_h4r_ferocity_connect_bridge.sql`

## Certified in production

- Full predeploy gate passed: public-data guard, provider-truth guard, UI guard, 42-workflow integration guard, TypeScript, ESLint, optimized production build, 130 test files, and 478 tests.
- Production launch smoke passed for the complete public buying path, health, authentication redirect, password reset, install page, and public worker intake.
- Production customer-path smoke created and cleaned up a tenant, source configuration, form, invite, Business Grader result, owner events, and live Starter checkout. The unpaid checkout was expired without a charge.
- Stripe live configuration passed for all seven prices. Stripe Connect reports card payments and payouts active, no current or past-due requirements, and no database drift.
- Public website chat created and removed a lead, two-way conversation, guarded handoff, and owner event.
- Estimate acceptance, deposit preparation, employee/labor intake, authority gating, Business Brain workflow readiness, and provider-independent message-health contracts passed.
- Retell inbound and fallback routing passed. The real callback evidence is recorded as certified. Capacity was 0/20 active calls, with five inbound slots reserved, a routine outbound soft limit of 15, and a per-tenant limit of two.
- The Ferocity Facebook connector package passed source readiness with destination `ferocity` and no H4R production references.
- H4R signed bridge, Ferocity Connect server controls, Facebook connector protocol, billing access, subscription lifecycle, webhook verification, and message-health isolation passed 54 focused tests.
- RLS verification passed after the migrations, including tenant-table coverage and sensitive-table grants.
- Controlled production load test passed: 120 GET requests at concurrency 12, zero failures, 14.2 requests/second, p50 332 ms, p95 1,041 ms, and p99 5,668 ms.
- Production health remained ready after load. Workflow health showed zero failed or stuck runs and zero failed or blocked actions in the prior 24 hours.
- Desktop and phone-width checks passed for Home, Pricing, Demo, Start, Ferocity Connect, and Install with no horizontal overflow, broken images, console warnings, or console errors.
- `robots.txt` allows public pages and blocks app/API/account paths. `sitemap.xml` contains the intended public marketing, support, legal, and SMS pages. Googlebot and Bingbot receive HTTP 200. Checked public pages have correct `ferocity.live` canonicals and no `noindex` response or metadata.
- Resend's existing production webhook was expanded to `email.received`, `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.failed`, and `email.suppressed`. A controlled production email to the Ferocity owner mailbox was accepted and reported `delivered` with message ID `c1449690-9cfa-4856-b0c7-f04d94e0782f`.
- Invalid Stripe, Resend, and voice webhook signatures were rejected with HTTP 400/401 while the public health endpoint remained ready, confirming failure isolation for those paths.

## Truthful production boundaries

These items do not block the core controlled release. They do block claims that the named optional lane is fully live-certified.

- Jobber is not currently customer-OAuth-ready in this runtime. Client configuration is absent and live actions remain disabled.
- TikTok must be reauthorized; the provider rejected the stored refresh token as invalid or expired.
- No Jobber, GoHighLevel, or Housecall Pro call-log bridge is configured for a tenant yet. The provider-independent bridge contract and retry/dead-letter design are ready.
- Retell transfer is intentionally unavailable until each tenant supplies and verifies its own transfer destination and the matching transfer tool is configured. Two-tenant live routing still needs two real tenant destinations and consenting testers.
- The Facebook connector still needs a real isolated-tenant browser installation/pairing test, one approved send, one inbound capture, offline/recovery, and revocation.
- The previously certified Samsung Ferocity Connect device has not checked in recently. A fresh production pairing plus outbound, inbound, STOP, START, HELP, offline/recovery, revoke, replacement, and update-install tests require the physical Android device.
- The flagship demo has a safe static walkthrough fallback. A final approved video override is not configured.
- A real paid subscription lifecycle still requires an owner-controlled payment instrument to verify charge, receipt/webhook entitlement, portal, renewal/change, cancellation/refund, failed-payment grace, restriction, and restoration. No test charge was made during this release.
- Field Team English/Spanish, location permission, offline synchronization, proof capture, and cross-tenant denial are covered by code/tests but still need a final two-account physical-device walkthrough.
- Microsoft advertiser identity and provider-side Meta/customer access reviews remain separate account approvals; they do not affect core Ferocity availability.
- The Android signing key still needs one encrypted recovery copy outside the current Windows/OneDrive identity before wider APK distribution.

## Release decision

The deployed core is suitable for a controlled customer launch. Provider-specific capabilities must remain labeled and gated according to their real readiness state. Do not describe the optional items above as live-certified until their external or physical-device evidence is recorded.
