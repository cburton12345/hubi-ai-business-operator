# Ferocity Final Launch Execution

Date started: 2026-07-30

This is the single launch-closeout checklist. An item is complete only when its pass criteria are supported by a real check. Do not store credentials, payment information, recovery codes, or customer-private data here.

## Guardrails

- Preserve existing functionality and tenant isolation.
- Do not create duplicate provider, messaging, billing, compliance, or autonomy systems.
- Do not launch advertising spend without an explicit budget and final transaction confirmation.
- Do not expose secrets in source, logs, screenshots, or documentation.
- Do not claim a provider is live merely because environment variables exist.
- Deploy the frontend once, after the pre-deploy checks pass and the owner explicitly approves the final wording and deployment.

## 1. Google Veo

- [x] Confirm the Ferocity Google AI Studio project has a usable paid API key.
- [x] Confirm the selected Veo model is available to that project.
- [x] Store the key only in Netlify production secrets.
- [x] Set the production video provider and model to Google Veo.
- [x] Preserve global and per-workspace monthly provider-cost caps.
- [x] Preserve profitable customer pricing above provider cost.
- [x] Verify usage rebilling remains enabled and Stripe-backed.
- [ ] Run one short, low-cost controlled render.
- [ ] Confirm the job can be refreshed and the completed video can be retrieved inside Ferocity.

Production checkpoint: `google_veo` / `veo-3.1-lite-generate-preview` is configured at a provider cost of $0.05 per second and a customer price of $0.25 per second. A paid render has not been submitted.

Pass criteria: one completed Veo render, metered usage record, enforced cost approval, and no secret exposure.

## 2. Advertising Providers

### Google Ads and YouTube

- [x] Verify production OAuth client, callback, developer token, and login customer mapping are staged in the production environment.
- [ ] Complete one real OAuth connection.
- [ ] Confirm reporting access without creating or modifying campaigns.
- [ ] Confirm YouTube inventory is available through the Google Ads lane.

Checkpoint: the production credentials and callback are staged, but the new callback code is not active until the owner-authorized deployment. A real reporting-only OAuth connection remains a post-deploy certification. No campaign or spend was created.

### Meta

- [x] Verify production app credentials and Business Login configuration.
- [ ] Complete one real OAuth connection.
- [ ] Confirm page/ad reporting access without publishing or spending.

Checkpoint: the Ferocity app and Business Login configuration exist. `ads_management`, `ads_read`, and `business_management` are ready for testing. The app remains unpublished and Tech Provider access verification is still required before production third-party access.

### TikTok

- [x] Confirm production app credentials and callback.
- [ ] Resolve the advertising-agreement restriction.
- [ ] Finish billing readiness without launching a campaign.
- [ ] Complete one real OAuth connection.
- [ ] Confirm account/reporting access without spending.

Checkpoint: the Ferocity developer app is in production review. Ads Manager still redirects to the generic TikTok for Business page, so billing and reporting cannot be completed yet. No campaign or spend was created.

### Reddit

- [x] Verify production OAuth credentials and callback are staged in the production environment.
- [ ] Complete one real OAuth connection.
- [ ] Confirm read/reporting access without posting or spending.

Checkpoint: `Ferocity Ad Account 07/12/2026` exists and its business URL is `https://ferocity.live`. Billing is staged at “Add a credit card” with a $0 balance. No payment or campaign was submitted.

### Microsoft Ads

- [x] Verify production OAuth credentials, callback, and developer token are staged in the production environment.
- [ ] Complete one real OAuth connection.
- [ ] Confirm reporting access without campaign or budget changes.

Checkpoint: sign-in reached the correct `ferocityflow@outlook.com` account and completed the Microsoft Authenticator challenge. Microsoft now requires the owner to choose and verify a personal recovery email before Ads can open.

### Optional Networks

- [x] Record Snapchat as optional/unavailable or connect it if account readiness is recoverable.
- [x] Record Yahoo/native ads as optional/unavailable unless a verified provider account exists.
- [x] Record GA4 property mapping as post-launch unless a verified property ID exists.

Checkpoint: Snapchat Google sign-in returned to the login screen without creating a usable session. It remains optional and unavailable until the provider account is linked successfully.

Pass criteria: supported launch networks can authenticate and read authorized data; unsupported networks are labeled honestly; no campaign spend occurs.

## 3. Retell Voice

- [x] Retell production key configured.
- [x] Ferocity support number purchased and assigned.
- [x] Ferocity AI Support assigned as both inbound and outbound call agent.
- [x] Signed webhook and provider adapter configured.
- [x] Provider cap, concurrency limit, and maximum call duration configured.
- [ ] Place one real inbound call.
- [ ] Verify AI greeting and support behavior.
- [ ] Verify transcript and call summary ingestion.
- [ ] Verify webhook signature handling and tenant routing.
- [ ] Verify cost/funding records update.
- [ ] Verify human escalation behavior without enabling unsafe actions.

Production checkpoint: Retell is pay-as-you-go with $10 remaining and 0/20 concurrency used. The support number is +1 (888) 256-6005. A real handset call is still required to verify greeting, transcript/summary ingestion, cost tracking, and escalation.

Pass criteria: one real call completes and appears in Ferocity with correct routing, transcript/summary, cost tracking, and escalation behavior.

## 4. Autonomy

- [x] Provider connection remains separate from execution authority.
- [x] Low-risk internal autonomy is the recommended new-customer default.
- [x] Hands-Free authority is available for separately authorized channels.
- [x] Consent, suppression, provider readiness, cost caps, and emergency shutdowns remain enforced.
- [x] Financial authority and meaningful spend remain protected.
- [x] Apply Trusted Autopilot to the real owner-controlled Internal Portfolio workspace without changing demo tenants or TZS.
- [x] Verify the Autopilot and advanced Controls interfaces locally.
- [x] Verify automatic low-risk execution and protected-action approval boundaries with command, authority, and office-manager smoke tests.

Pass criteria: routine reversible work can run automatically, protected actions cannot bypass controls, and existing workspaces have an intentional owner-selected mode.

## 5. Pre-Deploy Quality Gate

- [x] Typecheck passes.
- [x] Lint passes.
- [x] Unit tests pass: 56 files / 205 tests.
- [x] Production build passes.
- [x] Confirm all required migrations are applied.
- [x] Confirm production environment readiness by deploy context.
- [x] Confirm no secrets are tracked by Git.
- [x] Review the final diff for duplicate UI, awkward internal language, and unrelated changes.
- [x] Confirm the exact deploy scope.

## 6. Production Deployment and Smoke Tests

The checked items below describe the previous production baseline, deployment `6a6c3bf97cde28eae1ef26df`. They do **not** mean the July 31 release candidate has been deployed. The current release remains local/staged until the owner approves the final wording and explicitly authorizes deployment.

- [x] Commit/package the intended source state.
- [x] Deploy the frontend once to the existing Ferocity Netlify site.
- [x] Verify deployment reaches a successful terminal state.
- [x] Verify public landing page, pricing, signup, login, password recovery, and mobile layout.
- [x] Verify Stripe subscription checkout and webhook readiness without making an unnecessary purchase.
- [x] Verify tenant invoice/deposit payment link flow.
- [x] Verify employee/TZS access isolation.
- [x] Verify owner/admin portfolio isolation.
- [x] Verify provider integration pages show truthful readiness states.
- [x] Verify Retell, OAuth callbacks, inbound email, push, owner events, and MarketplacePro health.
- [x] Run final production smoke and route crawl.
- [x] Record any post-launch optional work separately.

Production checkpoint: deployment `6a6c3bf97cde28eae1ef26df` is live at `https://ferocity.live`. Fourteen production provider lanes passed smoke checks. Stripe is activated in live mode, a live unpaid Checkout Session was created and immediately expired, and Stripe Connect is enabled for tenant-owned payout onboarding.

Pass criteria: production is reachable, core acquisition/payment/operations paths work, tenant access is isolated, connected providers are truthful, and no critical smoke test fails.

## 2026-07-31 Connection Checkpoint

- A separate production `SECURITY_HMAC_KEY` is stored in the Netlify production context.
- Google OAuth credentials and Ads developer token are stored in the production context.
- Meta OAuth credentials and Business Login configuration ID `2301498587321705` are stored in the production context. The app remains unpublished and provider review requirements still apply.
- Reddit OAuth credentials are stored in the production context. The Ads account still needs billing and real authorization.
- Microsoft Ads OAuth credentials and developer token are stored in the production context. Microsoft still requires the owner to finish recovery-email verification.
- TikTok production credentials are stored. The provider app remains in review.
- Stripe server/webhook keys, video pricing and budget caps, Retell, and the Ferocity support-number settings are staged in the production context without initiating a payment, render, or call.
- Retell visibly confirms the Ferocity Support number, Ferocity AI Support agent, correct inbound webhook, $10 remaining, and 0/20 active concurrency. A real handset call is still required.
- The previously missing Google, Reddit, and Microsoft authorization-code callbacks now exchange tokens, encrypt access and refresh credentials, preserve tenant-bound state, and keep reporting verification and live actions disabled until separately proven.
- Migrations `154_atomic_managed_ad_wallets` through `162_jobber_native_read_model` are applied transactionally in production, including public content controls, provider promotions, native calendar sync infrastructure, the read-only Google Business Profile model, tenant-scoped service-platform coexistence bridges, and the native read-only Jobber analysis model.
- The review-request smoke verifies stable public links, destination fallback, private feedback, and service recovery; it rolls back its test data.
- Trusted Autopilot is applied only to Internal Portfolio: all 9 active AI workflows are auto-allowed while customer sends, publishing, premium video, voice calls, and money remain separately protected.
- The featured homepage/demo video plus the homepage, demo, pricing, and final-CTA messaging are now platform-admin configurable without a redeploy, with safe defaults, version history, local-link validation, and approximately 60-second revalidation.
- The Supabase production CA certificate is staged and verified against the existing pooler so the new release can validate database TLS certificates.
- Advertising promotions can be recorded and evaluated against required spend, planned spend, deadlines, and eligibility. Approval records guarded caps but cannot create a campaign, grant global campaign approval, or enable live spending. Offers recommended as `skip` cannot be approved.
- Customer-selected advertising limits are optional in the offer experience. Blank or cleared fields use conservative automatic safety boundaries without removing provider-cost protection.
- The provider-promotion rollback smoke verifies capture, guarded approval, the live-spend lock, progress, and qualification without retaining test data.
- The TZS-only, portfolio-owner, and existing-administrator credentials were regenerated, linked to live Supabase identities, and authentication-tested. The Windows-user-encrypted handoff is outside the source repository.
- Full local validation passes after the integration and lifecycle wave: production readiness (162 migrations / 90 required files), provider lanes, 62 test files / 220 tests, typecheck, lint, UI and public-data guards, 39 integrated workflows, RLS verification, and production build. Employee on-my-way texting now has a keyless native-SMS path, completed/paid invoice events enroll customers in the existing guarded review lifecycle without duplicates, incumbent service platforms can feed canonical contacts, leads, and jobs into Ferocity without enabling outbound writes, and Jobber can additionally connect through native read-only OAuth for provider-owned business analysis.
- The local release candidate passes the customer, owner, estimate, review, receptionist-call, command, authority, office-manager, and labor smoke paths. Production still runs the previous callback behavior until deployment.

These callback and buying-path changes are local only. They require the next owner-authorized deployment before real OAuth consent can complete. Do not deploy until the owner explicitly requests it.

## 2026-08-01 Capacity and Email Checkpoint

- The release candidate now uses a short scheduled dispatcher plus a 15-minute background automation worker, bounded tenant and agent batches, limited tenant concurrency, an expiring global lease, tenant failure isolation, bounded database pools, provider deadlines, safe retry rules, and capacity alerts.
- System Health now turns those stored signals into an owner-facing upgrade-before-interruption center with live database/queue/error metrics, active alerts, plain thresholds, and direct billing links. Provider plan purchases remain owner-controlled.
- Production migrations `163_runtime_capacity_leases.sql` and `164_platform_capacity_monitoring.sql` are applied; RLS and sensitive-table grant verification passed afterward.
- Supabase custom SMTP is configured through Resend for `hello@ferocity.live`, and the Supabase auth-email ceiling is 100 per hour.
- Supabase remains on Free/Nano. The recommended production minimum is Pro with the included Micro compute and seven days of daily backups.
- Netlify remains on the 300-credit Free plan with a hard limit, no auto top-up, and no team payment method. The recommended production minimum for the intended rapid launch is credit-based Pro with an owner-approved recharge ceiling.
- The production Resend key is valid and its API reports `ferocity.live` as verified in `us-east-1`. Controlled Supabase password-recovery and direct SMTP messages to the existing Ferocity Outlook account were delivered on 2026-08-01. The Ferocity Gmail login opens a different empty workspace, so the production domain's owning account and plan still need to be recovered. If the production account is still Free, its 100-email daily limit remains an eventual scale trigger.
- The Netlify token exposed in chat was replaced with a 90-day token and revoked. The local CLI still resolves the correct Ferocity owner, team, project, production URL, and account API after revocation. The replacement expires on 2026-10-30.
- The AI cost audit found eight active text/vision run types and only 25 recorded calls in the last 30 days, costing approximately $0.043. Ferocity already uses `gpt-4.1-mini`; GPT-5.6 Luna would increase the observed token cost by about 227 percent rather than reduce it. Economy, balanced, advanced, and vision routing lanes plus model-aware/cached-token accounting are implemented without changing the active model. Migration `165_ai_cached_token_accounting.sql` is applied and RLS verification passes. The full local gate now passes at 66 test files / 232 tests, typecheck, lint, and 67-page production build.
- A live synthetic model compatibility evaluation passed GPT-4.1 Mini and GPT-5.4 Nano on 5/5 launch-critical checks, rejected GPT-5 Nano at 2/5, and kept GPT-4.1 Mini as the production default because GPT-5.4 Nano did not demonstrate lower realized cost.
- The shared AI service now guarantees the explicit JSON instruction required by OpenAI JSON mode, preventing adapter-manifest requests from being rejected.
- Local validation passes at 64 test files / 226 tests, 67 static pages, and a successful Netlify production build. These checks do not prove live provider or production-load capacity.
- Exact activation gates and sequencing are recorded in `docs/1000-customer-production-activation-2026-08-01.md`.
- No application deployment occurred during this checkpoint.

## Current Release Decision

**Pre-deploy engineering status:** passed.

**Deployment status:** intentionally paused for the owner's final wording and explicit approval.

**Post-deploy certification still required:** one low-cost Veo render, one real Retell handset call, one reporting-only OAuth connection for each launch advertising provider that has completed provider-side approval, and one real review request after each launch brand's exact public-review destination is supplied.

## 2026-08-01 Non-Deploy Closeout

- The model evaluation now covers seven text run types with synthetic data. It kept GPT-4.1 Mini as the production default, rejected GPT-5 Nano for launch use, and retained GPT-5.4 Nano as an evaluation candidate rather than claiming savings that were not measured.
- The shared JSON instruction safeguard prevents OpenAI JSON-mode rejections.
- Growth-funnel AI output is normalized field-by-field against a safe fallback before array operations or persistence. Malformed model strings, objects, or creative-angle shapes can no longer crash the funnel action.
- The UI quality guard now validates real static public assets, including the standalone emergency fallback, without treating them as missing application routes.
- A separate random `SECURITY_HMAC_KEY` is staged as a secret in the Netlify production context. Netlify confirms that a redeploy is required before it affects the live release.
- Existing Google, Meta, Reddit, and Microsoft OAuth values were staged as production-context Netlify secrets. Meta's Business Login configuration ID is included. This does not bypass provider approval or prove live authorization.
- Production readiness passes at 165 migrations and 90 required files. Provider truth passes, and all 14 provider capability lanes pass their smoke test.
- RLS, tenant-table coverage, and sensitive-table grants pass.
- The rollback-safe estimate, review, Authority Engine, and Office Manager smoke paths pass without retaining test records.
- The complete local customer path passes: workspace creation, Business Grader, seeded sources/forms, lead and owner-event creation, no-free-tier enforcement, live Stripe Checkout creation, immediate Checkout expiration without payment, and database cleanup.
- The local compiled release handled 80 requests across the homepage, pricing, features, and health at concurrency 12 with zero failures, 36 ms p50, 675 ms p95, and 758 ms p99.
- The read-only production capacity check is healthy: 10 of 60 database connections (16.7 percent), zero due actions, zero failed or blocked actions in the last hour, two recent error events, and zero active capacity alerts.
- Validation passes at 68 test files / 236 tests, typecheck, lint, public-data guard, UI guard, 39 connected workflows, and a 67-page production build.
- No frontend or application deployment occurred during this closeout.
- A deeper workflow certification now distinguishes execution, behavior tests, source wiring, and post-deploy provider certification instead of treating the 39-chain wiring check as end-to-end proof. See `docs/workflow-certification-2026-08-01.md`.
- Workflow health found two abandoned AI-agent runs still marked `running`. Migration `166_ai_agent_run_lifecycle.sql` is applied; runtime stale-run recovery and a database uniqueness guard now prevent duplicate active runs. The follow-up health check reports zero stuck runs.
- Public chat was executed locally from visitor message through lead capture, AI response, guarded human handoff, and owner event, with cleanup. Scheduling and field-completion failure/approval paths now have focused regression coverage.

## Known Owner/Provider Checkpoints

These are not technical excuses; they are actions that third-party providers may require the account owner to perform:

- Payment-method confirmation or funding.
- Identity, phone, email, or business verification.
- CAPTCHA.
- Creating or revealing a persistent API key.
- Accepting a provider-specific advertising agreement.
- Completing a real phone call from an external handset.

## Deferred Voice Experience Benchmark

Do not begin this work until the current launch closeout is complete and the owner explicitly authorizes it. Preserve the provider-independent phone and voice-agent architecture.

- Analyze Snowie.ai's publicly observable voice experience and document what contributes to a human-feeling call without copying proprietary code, prompts, wording, branding, or protected content.
- Compare Ferocity against it for end-to-end latency, interruption handling and barge-in, turn-taking, pacing, dynamic tone, context retention, multilingual behavior, and complete call flow.
- Create an evidence-backed gap analysis before changing code.
- Improve Ferocity incrementally through the existing telephony and voice-agent adapters.
- Test after every change and retain only improvements that make calls measurably faster or more natural without breaking routing, safety, tenant isolation, transcripts, summaries, costs, escalation, or existing providers.

Pass criteria: provider-independent improvements with measured before-and-after call quality, no regression in existing functionality, and no imitation of proprietary implementation or branding.
