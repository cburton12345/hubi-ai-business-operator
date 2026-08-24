# Ferocity Launch Closeout To 100

Status: local release candidate complete. Deployment is intentionally held for owner authorization.

Local readiness: **100/100 for an authorized release candidate.**

Production cutover is not complete until the deploy-time section is explicitly authorized and performed.

## Verified August 23, 2026 — current held release

- Fixed the current All Tools quality gate at exactly 60 destinations without deleting the support, platform-activity, readiness, or diagnostic pages.
- Full local predeploy passed: public-copy guard, provider-truth guard, UI guard across 258 routes and 229 component files, 42 connected-workflow checks, TypeScript, full ESLint, and optimized production build.
- All 402 tests across 112 files pass.
- Applied migrations 187–191 transactionally to the connected Ferocity database. Migration validation now reports zero pending migrations.
- Tenant RLS and sensitive-table grant verification passed after the migration.
- Provider readiness and all 14 provider-lane groups pass for the core release; optional Meta official-login configuration, Yahoo, live voice funding/number, and Twilio SMS remain honestly connection-dependent.
- Facebook assisted-connector pairing, explicit opportunity capture, approval claim, outcome confirmation, health stops, and device-bound token revocation are implemented. The controlled browser test remains post-deploy because the new routes are not reachable on `ferocity.live` until the held frontend/application deployment.
- No frontend or Netlify preview deployment was performed.

This file supersedes the overlapping launch checklists as the source of truth for the current release. The older audits remain useful history, but completion is recorded here.

## Verified July 29, 2026

- Implemented configure-once preferences for organization, department, location, workflow, user, contact, customer, job, and project scopes.
- Added inline communication overrides with one-time and remembered scopes; provider, approval, language, execution, and fallback controls remain under Advanced.
- Added lead/customer communication preferences and contact-level no-AI-call and no-marketing-text enforcement alongside consent and suppression.
- Kept voice, messaging, and email independent. Voice setup treats SMS as optional and has no SMS/A2P launch blocker.
- Added explicit provider-failure and fallback records so failures cannot silently disappear.
- Applied migration 144 and verified tenant RLS.
- Local signed-in QA passed Action Queue override, contact preference, and voice-only setup surfaces.
- Completed a post-preference UI/copy pass: removed two real duplicate actions, reduced the Features hero to two choices, translated raw action/provider codes out of daily owner screens, and added the remembered-preferences advantage to the homepage, Features, and plan details without adding a feature dump.
- Final gates passed: 129 tests in 38 files, TypeScript, ESLint, public-copy guard, 215-route UI guard, 30 integrated workflows, 144-migration readiness, 13 provider lanes, office-manager and receptionist-call smoke tests, and the optimized production build.
- No frontend deploy or Netlify preview was created.

## Verified July 28, 2026

- Completed the provider-independent phone customer experience with four tested paths: keep the current number by forwarding, keep it with full integration, get a new number, or bring another provider.
- Added one provider-neutral, industry-specific phone-agent profile that carries business name, greeting, tone, languages, goals, custom instructions, escalation rules, and safety guardrails into interchangeable voice adapters.
- Kept telecom and voice providers out of normal onboarding; raw provider controls remain collapsed under Advanced settings.
- Saved and reloaded every phone path and a customized QA voice profile in the isolated QA workspace. No live provider, call, payment, or production customer record was used.
- Verified the authenticated Ask Ferocity read-only path, lead scoring, operational QA feedback, revenue scanning, and mobile/desktop phone surfaces.
- Fixed repeatable QA seed duplication and a real workspace-level revenue recommendation duplication bug. Migration 143 now enforces idempotent workspace recommendations and is recorded in the connected database.
- Authenticated route crawl passed 122 checks. All six customer/estimate/office-manager/receptionist/AI-command/authority smoke chains passed.
- Final release gates passed: 124 tests in 36 files, TypeScript, ESLint, public-copy guard, 215-route UI guard, 30 connected workflows, 143-migration production readiness, RLS isolation, all 13 provider lanes, zero production dependency vulnerabilities, and a 65-page production build.
- Frontend deployment remains intentionally held for explicit owner authorization.

## Release Rules

- Do not deploy the frontend or publish a Netlify preview until the owner explicitly authorizes it.
- Outstanding owner checkpoint: complete Microsoft Advertising advertiser identity verification before treating Microsoft Ads as launch-ready. Authentication, account funding, or OAuth setup alone do not satisfy this verification gate.
- Deployment boundary reaffirmed 2026-08-23: backend/local preparation may continue, but no frontend production or preview deployment is authorized until the owner explicitly says to deploy the frontend.
- Do not apply live Supabase migrations until the owner explicitly authorizes it.
- Preserve working systems and make surgical changes; do not redesign stable workflows for novelty.
- Core Ferocity must remain useful without every optional provider.
- Customer-visible sending, calling, publishing, ad spend, and payment actions must respect connection state, consent, authority, and cost controls.
- "100/100" means the repository is locally verified and ready for an authorized release. It does not mean optional third-party accounts are magically approved.

## Definition Of Done

A release candidate is ready when:

- [x] The app has one clear owner front door and no duplicate primary actions in the global shell.
- [x] The All Tools menu has no repeated destinations and does not make internal diagnostics compete with daily work.
- [x] Public pages sell outcomes clearly, expose paid signup plainly, keep the free grader distinct from a free plan, and avoid redundant hero actions.
- [x] New construction intelligence, authority/link intelligence, growth funnels, revenue automation, and guarded message execution have real routes, data paths, controls, and readiness coverage.
- [x] Scheduled automation can be bundled for Netlify and fails safely when its token or site URL is missing.
- [x] Internal links and required routes are checked automatically.
- [x] Typecheck, lint, unit tests, production build, public-copy guard, production-readiness check, provider-lane smoke, production dependency audit, and route crawl pass.
- [x] Desktop and mobile public/app surfaces have no horizontal overflow, clipped controls, or unusable navigation.
- [x] Remaining deploy-time steps are exact, minimal, and separated from optional provider setup.

## Local Closeout Work

### 1. Information architecture and clutter

- [x] Remove repeated destinations from the global All Tools menu.
- [x] Remove the duplicate global Ask Ferocity button while keeping the command workflow obvious.
- [x] Do not show two Ask Ferocity forms on the owner home screen.
- [x] Reduce shortcut chips to the highest-value daily actions.
- [x] Keep advanced diagnostics reachable but visually subordinate to owner workflows.
- [x] Check page-level exact duplicate buttons and retain repeats only when they serve a deliberate top/bottom conversion path.

### 2. Public conversion path

- [x] Reduce the homepage hero to one paid-path action and one free-grader action.
- [x] Keep Install Ferocity visible without making it compete with signup.
- [x] Make the pricing hero lead into plan comparison instead of prematurely duplicating a single plan checkout.
- [x] Verify Starter includes the real AI/Authority engine and tiers are differentiated by departments, depth, connections, and proactivity rather than arbitrary cheap-action run caps.
- [x] Keep Job Tracker and both custom options.
- [x] Keep variable-cost/provider language clear and non-alarming.

### 3. New-system completion audit

- [x] Verify construction Job Health is linked, evidence-backed, and migration-covered.
- [x] Verify Authority Link Intelligence distinguishes earned/referral value from estimated SEO value.
- [x] Verify Growth Funnels create qualification and follow-up records rather than decorative cards.
- [x] Verify the revenue loop materializes appointments, reminders, enrollments, steps, and conversion events idempotently.
- [x] Verify ready email/SMS actions pass consent, provider, authority, suppression, and cost gates.
- [x] Verify the scheduled automation runner calls the guarded application route and is represented in readiness checks.
- [x] Verify public demo/features/growth/pricing copy mentions the new value only where the workflow is real.
- [x] Verify every launch-critical feature has an input, persisted state, trigger, downstream consumer, owner-visible result, and recovery route.

### Connected-workflow matrix

| Capability | Input | Persisted state | Trigger / worker | Downstream result | Owner surface | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Growth funnel qualification | Public `/forms/[publicKey]` form with generated questions | `forms`, `form_submissions`, `leads`, qualification answers in lead metadata | Public submission scoring; scheduled revenue loop | Qualified, consented leads enter the matching follow-up sequence | Lead Command, Revenue Growth, Owner Command | Connected |
| Construction job intelligence | Estimates, jobs, changes, field logs, costs, invoices, assignments, purchase orders | Daily logs and deduplicated health snapshots | Scheduled business automation | High/critical evidence-backed job risks become owner events; cleared risks resolve | Job Health, Attention Command, Owner Command, daily brief | Connected |
| Link Authority | Drafts, completed jobs, knowledge, suppliers, backlink imports | Linkable assets, opportunities, backlinks | Scheduled business automation plus manual verification/import | Real assets and supplier relationships become candidates; lost/suspicious links and qualified opportunities become owner events | Main Authority score, Link Authority, Attention Command, Owner Command | Connected |
| Revenue follow-up | Qualified leads, appointments, accepted jobs, invoices | Sequences, enrollments, reminders, workflows, conversion events | Scheduled revenue loop and guarded Action Queue | Consent/provider/authority/cost-gated email or SMS work | Revenue Growth, Lead Command, Action Queue, daily brief | Connected |
| AI Office Manager / voice and chat | Calls, website chat, inbox messages, public lead intake | Call records, shared conversations, messages, leads, appointments, owner events | Provider webhooks, public chat AI, receptionist intake | Lead routing, missed-call recovery, booking, follow-up context and owner escalation | Office Manager, Messaging, Lead Command, Owner Command | Connected; live phone depends on provider |
| Customer lifecycle | Calls, leads, estimates, jobs, invoices, reviews, customers | Follow-up workflows, referral links, attribution, AI outputs | Customer Lifecycle Manager daily and immediate missed-call trigger | Nurture, reactivation, estimate recovery, referrals and past-customer campaigns enter guarded Action Queue | AI Workforce, Revenue Growth, Action Queue, Owner Command | Connected |
| Industry knowledge | Brand industry plus tenant module assignment | Versioned knowledge modules/items and tenant overrides | Used by public AI chat and Business Brain; reusable by every AI employee | Industry-specific intake and decisions retain source guardrails and verification flags | Business Info / Business Brain | Roofing v1 connected; modular expansion ready |
| Estimator to operations | Estimate builder, public estimate decision | Estimates, warnings, change orders, jobs | Acceptance and job-health scans | Accepted work becomes schedule/cost/risk input instead of a dead estimate | Estimator, Service Command, Job Tracker, Job Health | Connected |
| Variable-cost media and messaging | Approved queued action | Queue reservations, provider attempts, usage/cost records | Guarded processor | Idempotent send/render/publish attempt or explicit block reason | Action Queue, controls, provider lanes, billing | Connected; provider-dependent |

The automated `features:integrated` guard checks these launch-critical code paths so future work cannot quietly remove their cross-system consumers.

### 4. Automated guardrails

- [x] Add a UI quality guard for duplicated global-navigation destinations and invalid literal internal routes.
- [x] Add the UI quality guard to the local predeploy command.
- [x] Add a feature-integration guard to the local predeploy command.
- [x] Expand route crawl coverage for the newly added launch-critical pages.
- [x] Ensure production readiness requires this checklist and the latest migrations/automation files.
- [x] Validate Netlify configuration and function bundling locally without deploying.

### 5. Full verification

- [x] `npm test`
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run public:guard`
- [x] `npm run prod:check`
- [x] `npm run provider:lanes:smoke`
- [x] `npm run build`
- [x] `npm audit --omit=dev`
- [x] Unauthenticated public/protected route crawl against the production build.
- [x] Authenticated app route crawl when a safe local/QA session is available.
- [x] Desktop and mobile visual/overflow pass on the primary conversion and owner paths.

## Deploy-Time Work — Requires Explicit Authorization

- [x] After explicit owner authorization, apply unapplied Supabase migrations through `129_variable_cost_safety_controls.sql`.
- [x] Confirm the production environment contains `AI_WORKFORCE_CRON_TOKEN` and the app sees the same value.
- [x] Confirm the linked Netlify project is `ferocity.live`, with
      `FEROCITY_APP_URL=https://ferocity.live`; Netlify supplies `URL` to the
      scheduled-function runtime.
- [x] Run a final local predeploy check from the release-candidate source state.
- [ ] Deploy once to the intended Ferocity Netlify site.
- [ ] Run post-deploy health, auth, checkout, webhook, scheduled automation, and route smoke checks.

## Optional Provider Activations — Do Not Block Core Launch

- [ ] Twilio or another SMS provider, including registration/compliance.
- [ ] Live voice provider and phone routing.
- [ ] Activate the OpenAI Video adapter only after setting global and per-workspace hard cost caps, profitable per-second pricing, and usage billing. The live adapter and authenticated delivery path are implemented; briefs remain available while activation is off.
- [ ] TikTok and Yahoo advertising credentials.
- [ ] Additional customer-owned ad, publishing, calendar, inbox, or niche-destination accounts.

These remain labeled as connection-dependent. They become launch blockers only if public copy claims the live provider action is already active.

## Evidence Log

Verified July 28, 2026:

- User-authorized production deployment `6a691c8fd6f1e9b49a3f67e5` is live at
  `https://ferocity.live`.
- Post-deploy typecheck, unit/security tests, and ESLint all passed.
- The live smoke suite passed the landing, features, automations, integrations,
  website connection, demos, pricing, signup, install, business health score,
  login, password reset, health, protected-app redirect, and public worker
  intake paths.
- Both Stripe webhook routes reject unsigned production requests.
- Stripe's live Accounts v2 destination delivered a real signed ping that was
  recorded as verified and processed. The connected-account snapshot
  destination is enabled for 11 direct-charge, failure, refund, dispute, and
  payout event types.
- The production security HMAC is present and masked in Netlify. The local
  provider-readiness warning reflects deliberate non-storage of that production
  secret in `.env.local`, not a production configuration gap.
- A final configuration audit found the managed-payments flag enabled before
  its pilot gate; it was changed to `false`, redeployed, and verified. Managed
  Stripe Connect remains deliberately feature-flagged off until one
  controlled connected-account onboarding/payment/refund/disclosure pilot
  passes. Basic Ferocity subscription billing is live-ready and separate.

- Migrations 117-129 were applied transactionally to the authorized Ferocity
  Supabase project. Migration 121's invalid legacy RLS helper reference was
  corrected before retry; all 134 repository migrations are now recorded.
- Tenant RLS verification passed for an authorized owner and an unrelated
  authenticated user.
- The migrated production build passed 118 public, protected, and authenticated
  route checks.
- Desktop and 390px mobile Edge QA found no horizontal overflow or blank
  surfaces across homepage, pricing, owner home, scheduling, purchasing,
  reporting, and employee workday. A field-app hydration mismatch and unstyled
  compact metrics were fixed and retested with zero console errors.
- Provider readiness passed for core app, Resend, OpenAI, Stripe subscriptions,
  push, Google, Meta, Reddit, and Microsoft. All 13 provider-lane groups passed.
- Persisted provider state was reconciled against provider-side checks:
  OpenAI, Resend, Stripe subscriptions, Supabase, MarketplacePro intake, and
  signed webhooks now record their verified connection state; Google, Meta,
  Reddit, Microsoft Ads, Google Ads, and Search Console record configured OAuth
  apps without falsely claiming that a customer authorization grant exists.
  All live-action flags remain off.
- Stripe live readiness read all five configured prices, created a real
  checkout session, and expired it without payment. The paid customer path
  then passed the current no-free-tier policy; its smoke checkout was expired
  and test-only workspace data was removed.
- The Netlify production environment points to the same Supabase project,
  exposes `https://ferocity.live`, and has an automation token matching local.
  No frontend deploy or preview was created.
- The unauthenticated generic messaging webhook was hardened with timestamped
  HMAC verification and replay protection. A distinct production secret was
  provisioned without deploying the frontend.
- Twilio Console currently returns to login in Edge and no Twilio, voice,
  Stripe Connect, QuickBooks, calendar, mapping, TikTok, Yahoo, or premium-video
  credentials are available. Those lanes remain disabled and are not labeled
  live.
- The final local predeploy command passed public-copy, UI, 28 connected-workflow,
  TypeScript, ESLint, and production-build gates.
- The complete local predeploy gate was rerun after provider reconciliation and
  passed again; all 88 tests, provider readiness, all 13 provider lanes, and the
  production-only dependency audit also passed.
- The production build compiled 62 static pages and includes the new public
  appointment route, purchasing/accounting desk, service reporting, and
  variable-cost controls.
- Unit tests passed: 88 tests across 25 files, including SMS ASCII/Unicode
  segment-cost and messaging-webhook authentication regression coverage.
- Production readiness passed with 134 migrations and 87 required files; UI
  quality passed across 208 routes, 186 component files, and 60 unique All
  Tools destinations.
- Provider-lane smoke passed all 13 capability groups and the production
  dependency audit reported zero vulnerabilities.
- No Netlify deploy or preview was created.

Verified July 27, 2026:

- Removed the redundant global Ask Ferocity button, hid the compact command strip on the owner home page, reduced global shortcuts, and reduced All Tools to 59 unique destinations.
- Removed duplicated Work-page actions and 200+ lines of unreachable legacy Action Queue scanner code.
- Consolidated Action Queue provider accounts, provider routes, and consent records into collapsed reference panels so queued decisions remain primary.
- Fixed mobile two-column metric behavior and measured no horizontal overflow at 390px or 1440px on homepage, pricing, features, demo, growth system, install, owner home, Action Queue, Job Health, Growth Funnels, and Revenue Growth.
- Added `scripts/ui-quality-check.mjs`; it verified 196 route patterns, 173 component files, zero invalid literal internal links, and zero repeated All Tools destinations.
- Hardened the new messaging loop:
  - Manual and scheduled sends now share one idempotency namespace, preventing a double-send race.
  - Approved retries receive a new attempt key instead of being permanently blocked by the original failed reservation.
  - A concurrent/pending reservation is no longer reported as a completed send.
  - Cross-workspace joins in queue scanning and manual email execution include tenant scope.
- `npm test`: 78 tests in 22 files passed.
- Typecheck, ESLint, public-copy guard, UI guard, and production-readiness checks passed.
- Production build passed with 59 static pages and all dynamic routes compiled.
- Netlify production-context local build passed with Next.js Runtime 5.15.13; the Next server handler and `run-business-automation.ts` scheduled function bundled successfully.
- Production dependency audit reported zero vulnerabilities.
- The full audit still reports nine high-severity advisories confined to ESLint/minimatch development tooling. The advertised major ESLint 10 path is currently incompatible with the Next lint stack; these packages are not shipped in the production dependency set.
- Provider-lane smoke passed for 13 capability groups.
- Provider readiness passed for core app, vault, owner intake, monitor jobs, workforce intake, MarketplacePro, push, Google/GBP, Meta, Reddit, Microsoft, Resend, Stripe subscriptions, and OpenAI. TikTok, Yahoo, premium video rendering, live voice, and optional Twilio SMS remain honestly connection-dependent.
- Final production-build crawl passed 110 checks: public pages returned successfully, protected pages redirected when signed out, and authenticated launch-critical app pages rendered successfully.
- Read-only migration inspection confirmed `118_construction_job_intelligence.sql`, `119_authority_link_intelligence.sql`, and `120_revenue_loop_automation.sql` are not recorded in the connected database. They remain deliberately unapplied until migration authorization.
- Connected generated qualification questions to the existing public lead form, saved and scored only server-verified question IDs, and fed qualified consented leads into the existing revenue automation.
- Moved construction health calculation into scheduled business automation, deduplicated unchanged snapshots, escalated high/critical evidence-backed risks, and automatically resolved cleared risk events.
- Connected Link Authority to scheduled discovery, the main Authority score, and Owner Command; existing drafts, completed jobs, knowledge, and suppliers now feed the system without enabling automatic outreach.
