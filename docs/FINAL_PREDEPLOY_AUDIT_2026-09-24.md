# Ferocity final predeploy audit — 2026-09-24

## Deployment decision

Application code and database: **ready for a preview deployment**.

Production promotion: **not yet performed**. Netlify accepted all application files except the final large server-function upload, but the local network repeatedly failed DNS/fetches or allowed Netlify's short-lived storage token to expire. Do not describe the current code as deployed until a preview URL is returned and the production promotion succeeds.

## Passed gates

- All database migrations through `229_provider_neutral_paid_media` applied.
- Row-level-security and sensitive-table grant verification passed.
- Production readiness passed with 229 migrations and 116 required files.
- Provider-lane smoke passed for 14 capability groups.
- Full local predeploy suite passed: 175 test files and 639 tests.
- Final focused suite passed: 4 files and 18 tests.
- ESLint passed with zero warnings after excluding stale generated Next build directories.
- TypeScript passed.
- Next production build passed with 114 static pages generated.
- Public claims, provider truth, capability truth, feature integration, migration validation, marketplace worker tests, and UI route guard passed.
- Stripe Connect is active for payments and payouts with no currently-due or past-due requirements.
- Retell callback route is certified with real inbound-call evidence.
- Receipt and statement intelligence schema, storage, RLS, aliases, and migrations are ready.
- Local production browser QA passed for homepage, pricing, start, login, password reset, Ferocity Connect, features, demo, privacy, terms, health, and Supabase health.
- Security headers returned on tested routes: `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.

## Public-page corrections included

- Removed internal-facing “AI operations department,” “AI employees,” and similar wrapper-style copy from the main public positioning and demo/checkout language.
- Corrected the editable production homepage eyebrow so database content cannot restore the older “Meet your AI operations department” wording.
- Kept Ferocity positioned as the operating/control layer across the business, with marketing as one connected capability rather than the whole product.
- Ferocity Earn is presented before monthly plans.
- Signup begins with the outcome the customer wants and defers advanced setup.
- Login includes password recovery.
- Ferocity Connect explains subscriber-only signed download and one-time pairing.
- Customer OAuth setup no longer asks ordinary customers for developer keys, app secrets, or developer-console work.

## Known non-launch blockers / incomplete providers

- Vonage remains disabled because production credentials, approved sender/number, signature secret, webhook URLs, funding/registration, and explicit send enablement are not configured.
- Meta Business Login configuration `2301498587321705` is present locally and documented as staged in Netlify. The next deployment must prove the effective production runtime, followed by customer OAuth, Page/account selection, and final permission/app-review validation.
- TikTok Login is connected, but content publishing and Business/Ads API approvals must be independently certified before direct posting or campaign execution is labeled live.
- Microsoft, Reddit, and other ad networks must complete tenant OAuth/account selection and capability certification before direct execution is labeled live.
- Yahoo is optional and unconfigured.
- An old Jobber access token is expired; its refresh token remains healthy and should be used to refresh/reverify the connection.

## Required preview checks

After Netlify returns a preview URL, verify:

1. `/`, `/pricing`, `/start`, `/login`, `/reset-password`, `/ferocity-connect`, `/features`, and `/demo` render without client errors.
2. `/health` and `/api/health/supabase` return 200.
3. Homepage shows “One connected system for the company” and no stale “AI operations department” eyebrow.
4. Start flow does not create billing, publish, message, or spend before explicit customer action.
5. Login, invitation, and password-reset links use the preview/production host correctly.
6. Stripe checkout opens the expected live product only when deliberately tested; do not complete a charge during smoke testing.
7. Authenticated integrations show customer Connect flows, while platform-only developer configuration remains admin-only.
8. Connect download stays authenticated, short-lived, and separate from one-time pairing.

## Required production checks

After production promotion:

1. Repeat the preview routes and health checks on `https://ferocity.live`.
2. Verify canonical URL, sitemap, robots, CSP, HSTS, frame protection, and content-type protection.
3. Complete one controlled signup/invite/password-reset lifecycle with a designated smoke account.
4. Complete one controlled Retell inbound call and verify transcript, summary, tenant routing, transfer policy, and post-call record.
5. Complete one consented Connect SMS round trip and verify queued, sent, delivered/failed, inbound, STOP/HELP, and workspace timeline states.
6. Verify no ad spend, public publishing, hosted SMS, or paid media generation activates without the configured authority and spending gates.
7. Re-run provider readiness and record the effective production environment rather than relying on local environment values.
