# Ferocity agent handoff

Last reconciled: September 30, 2026 (America/Los_Angeles)

This is the portable starting point for Codex, Claude Code, Cursor, Copilot, Grok, or another coding agent. Read this file and `AGENTS.md`; do not depend on chat history. Detailed historical documents remain useful evidence, but they are not all current.

## 1. Safety and current repository state

- Repository: `https://github.com/cburton12345/hubi-ai-business-operator.git`
- Active local branch at handoff: `codex-preserve-ferocity-latest`
- Current recorded commit: `4b85648 Record continued live provider certification`
- Production: `https://ferocity.live`
- Netlify site ID: `418ea625-bb2f-45cc-951c-33b231147ab8`
- Supabase project ref: `puvpgebitzvyqbdnnlyz`
- Supabase URL: `https://puvpgebitzvyqbdnnlyz.supabase.co`
- The working tree is intentionally very dirty: 438 status entries were observed on September 30 (216 modified and 222 untracked). It contains months of product work, provider adapters, migrations, tests, UI changes, Android work, and documentation.
- Full `npm run predeploy:local` passed on September 30: public/provider/capability/UI/integration guards, migration validation, 186 test files with 703 tests, Marketplace worker checks, typecheck, lint, and the Next.js production build. The build emitted the existing `unpdf/pdfjs` dynamic-dependency warning but completed successfully.
- Do not run destructive Git commands, mass cleanup, broad formatting, or regenerate files without checking overlap. Never use `git reset --hard`, `git clean`, or checkout-based discards.
- A production deploy is not a backup. Preserve work with a reviewed Git checkpoint; deploy only after release gates pass and the owner says the exact words `do front end deploy`.
- Do not assume every local migration or adapter is deployed. Verify production state independently.

## 2. Product definition and non-negotiable rules

Ferocity is an AI operating system for running and growing a business. It combines shared business context, business records, permissions, controlled execution, communications, operations, money, workforce, growth, measurement, and an owner command layer.

Product rules:

- Ferocity is for contractor/field-service companies and professional/white-collar businesses; do not reduce the core brand to either category.
- It is more than a tool collection and more than advice. Ferocity should identify bottlenecks/opportunities, propose a plan, perform authorized work, surface exceptions, measure business outcomes, and learn.
- The in-app Ferocity conversation is the main operating interface, but conventional dashboards and direct controls remain available.
- Native AI Workforce roles are coordinated workflows over shared context, tools, and action contracts. Do not fake independent agents or “agent theater.”
- Ferocity is agent/provider agnostic. Native AI and future outside agents (OpenAI, Grok/xAI, Gemini, Claude, specialized providers) should use the same permissioned business-action layer.
- Ferocity remains the system of record/control layer: identity, tenant boundaries, permissions, approvals, business state, audit logs, attribution, budgets, and safety stay inside Ferocity.
- Normal customers connect providers by signing in, granting scoped access, and selecting an account. Ferocity owns platform developer apps, OAuth clients, callbacks, webhooks, and provider approval.
- Read-only discovery comes first. Public posts, messages, calls, campaign writes, spend, billing, money movement, destructive actions, and low-confidence actions require explicit policy/approval.
- Capability and connector statuses must be honest, runtime-driven where possible, and changeable without a new deploy after the status framework itself is deployed.
- Do not expose proprietary prompts, scoring, orchestration, schemas, or implementation details on public pages. Explain outcomes, controls, proof, and customer-facing capability.
- Preserve audit evidence and originals for documents, communications, provider events, expenses, and material actions.
- Never fabricate reviews, engagement, leads, results, activity, or rankings; never spam communities; follow provider policies.

Commercial rules (current new-sale model; verify before changing):

- Starter: $149/month or $1,490/year.
- Growth: $349/month or $3,490/year; recommended plan.
- Operator: $699/month or $6,990/year.
- Ferocity Earn: 0.9% of customer-originated collected revenue Ferocity manages, or 6% of Ferocity-originated collected revenue; rates never stack.
- Provider/processor/telecom/media costs are disclosed separately unless an explicit allowance or sponsorship policy applies.
- Current managed allowances: voice 25/100/300 minutes and hosted SMS 100/300/1,000 segments; documented overages are $0.25/minute and $0.04/segment.
- Existing subscriptions are not silently repriced.

## 3. Technology and architecture

Core stack:

- Next.js 16 App Router, React 19, TypeScript 5.9, Node 22.
- Supabase Auth plus PostgreSQL as the durable data layer; SQL migrations live in `supabase/migrations/`.
- Netlify hosts the Next.js application and serverless/background functions.
- Stripe provides subscriptions, Checkout/portal, usage paths, and optional Connect-managed payments.
- Vitest, ESLint, TypeScript, and repository-specific readiness scripts form the release gates.

Request/data layers:

- `src/app/`: public pages, authenticated app surfaces, server actions, and API routes.
- `src/lib/db/postgres.ts`: server-side PostgreSQL access.
- `src/lib/supabase/`: browser/admin Supabase clients.
- `src/lib/auth/`, `src/lib/tenancy/`, `src/lib/workspace/`: authentication and workspace scoping.
- `supabase/migrations/`: canonical schema evolution. Local files currently extend through migration 232; verify the production migration ledger before applying anything.
- Multi-tenant operations must enforce membership/role checks and RLS; service-role access remains server-only.

Intelligence/execution layers:

- `src/lib/business-actions/`: provider-neutral business action contracts/execution boundary.
- `src/lib/capabilities/`: capability catalog and discovery.
- `src/lib/ai-workforce/`: command understanding, routing, workflows, guided conversation, and execution runtime.
- `src/lib/ai/`: model provider abstraction, routing, cost accounting, BYO model support, and video service.
- `src/lib/automation/`, `src/lib/actions-queue/`, `src/lib/authority/`, `src/lib/controls/`: scheduled work, durable actions, authority, approvals, and service gates.
- `src/lib/business-brain/`, `src/lib/attention-command/`, `src/lib/owner-command-center/`: shared context, opportunity/exception detection, and owner-level control.

Operating domains:

- CRM/revenue: `lead-command`, `leads`, `customer-lifecycle`, `customer-success`, `cash-collection`, `sales`.
- Work/field: `job-tracker`, `service-ops`, `field-ops`, `construction`, `scheduling`, `operations-workforce`, `employee`.
- Money: `billing`, `payments`, `accounting`, `document-intelligence`, `exports`.
- Communications: `messaging`, `phone`, `email`, `calendar`, `ferocity-connect`, `push`, `office-manager`.
- Growth: `growth`, `marketing`, `marketing-os`, `publishing-hub`, `local-presence`, `seo`, `reviews`, `ugc`.
- Observability/trust: `observability`, `readiness`, `reliability`, `safety-readiness`, `reports`, `provider-costs`.

Provider architecture:

- Generic OAuth entry/callback routes: `src/app/api/integrations/[provider]/oauth/`.
- Shared Google callback: `src/app/api/integrations/google/oauth/callback/`.
- Provider registry/contracts: `src/lib/integrations/oauth-providers.ts`, `standard-oauth.ts`, `complete-standard-oauth.ts`, `connector-runtime.ts`.
- Encrypted tenant credentials: `src/lib/credentials/` and `src/lib/integrations/provider-access-token.ts`; encryption keys never reach the browser.
- Runtime truth/certification: `provider-capability-truth.json`, `capability-truth.ts`, `provider-certification.ts`, `provider-lane-readiness.ts`.
- Paid media: `src/lib/growth/paid-media-provider-registry.ts`, `paid-media-orchestrator.ts`, advertiser-account discovery, and provider adapters.
- Canonical distribution: `src/lib/growth/canonical-distribution.ts`, `distribution-service.ts`, and publishing hub.
- Local presence: `src/lib/local-presence/` with provider-neutral profile/review/content/measurement concepts.
- Provider writes and spend stay disabled until credentials, provider approval, tenant authorization, capability certification, owner policy, and budget gates all pass.

Companion runtimes:

- `netlify/functions/`: durable/background automation, growth, mailbox, publishing cadence, conversion feedback, and weather-demand work.
- `ferocity-connect-android/`: Android SMS gateway; releases are private, signed, and entitlement-gated.
- `services/ferocity-connect/`: Ferocity Connect server/service support.
- `workers/marketplace-worker/`: deployment-independent Windows worker contract, supervisor, credential storage, queued Facebook/Marketplace browser work, crash recovery, and idle browser shutdown.
- `ferocity-facebook-connector/` and `connectors/facebook-assisted/`: assisted Facebook paths; preserve rules/approval boundaries and never evade platform safeguards.

## 4. What Ferocity currently contains

The codebase includes, at different certification levels:

- Public site, pricing/Earn, signup/invite/recovery, public AI sales conversation, business diagnostic, and lead capture/follow-up.
- Authenticated owner chat/command interface, dashboards, roles, field-team mode, workspaces, approvals, actions, notifications, and support.
- Leads/customers, estimates, jobs/projects, scheduling/dispatch, tasks, forms, documents, field logs, labor/hours, purchasing, invoices, payments, collections, reviews, retention, and reporting.
- AI workforce orchestration, model routing, provider-neutral business actions, capability discovery, authority boundaries, automation, monitoring, and owner attention.
- Calls/AI receptionist, managed-number lifecycle, Retell tools/webhooks, human-transfer routing, email monitoring/sending, messaging, scheduled texts, and Ferocity Connect.
- Receipt/invoice/statement OCR and expense intelligence with batch ingestion, allocation targets, deduplication, source preservation, job-costing hooks, and H4R reuse boundaries.
- Growth intelligence, organic cadence, audience/content work, SEO/AI-search/local presence, weather-demand signals, paid-media orchestration, canonical multi-channel distribution, closed-loop attribution, and learning.
- Provider-neutral AI video planning/rendering/pricing abstractions and UGC/content-production workflows.
- Stripe subscriptions, published plan configuration, Earn rules, usage/cost accounting, and guarded Connect payments.

“Implemented” does not equal “production-certified.” Use capability/provider status and behavioral certification, not file existence, before making claims.

## 5. Directory map

| Path | Purpose |
| --- | --- |
| `src/app/` | Next.js public pages, authenticated UI, actions, and APIs |
| `src/components/` | Reusable public/admin/product components |
| `src/lib/` | Business logic organized by domain |
| `supabase/migrations/` | Ordered production schema changes |
| `netlify/functions/` | Scheduled/background serverless entry points |
| `scripts/` | Migrations, smoke tests, certification, provisioning, and release utilities |
| `docs/` | Product decisions, runbooks, certification evidence, and provider/account truth |
| `ferocity-connect-android/` | Android SMS gateway application |
| `services/ferocity-connect/` | Connect service runtime |
| `workers/marketplace-worker/` | Local/hosted Windows Marketplace worker |
| `ferocity-facebook-connector/` | Browser connector release source |
| `connectors/facebook-assisted/` | Assisted Facebook connector implementation |
| `public/downloads/` | Published connector/worker packages; verify versions before release |
| `.private/` | Git-ignored local secret/account notes; never commit |

## 6. Secure configuration and account access

Do not copy secrets into this handoff, issues, chat, committed Markdown, or client code.

Where configuration lives:

- `.env.example`: canonical variable names and safe defaults only.
- `.env.local`: local development secrets; Git-ignored. Never print or commit it.
- Netlify production/deploy-preview environment: production server secrets, OAuth clients, webhooks, Stripe, AI, messaging, and provider credentials.
- Supabase dashboard: database/auth settings, service-role material, redirects, SMTP, storage, and production migration state.
- `.private/ferocity-account-vault.md`: local Git-ignored account-location notes; use only if present and never quote secrets.
- Other `.private/*`: provider-specific one-time credentials where explicitly documented (for example the OpenAI Ads key file). Keep Git-ignored.
- Password manager/Windows Credential Manager: provider passwords, recovery data, and account secrets.
- Provider dashboards: rotate/recover credentials at the source when absent; do not infer or invent them.
- Android signing recovery: follow the Connect release evidence/runbook; never expose signing material.

Canonical account/status map: `docs/ferocity-account-inventory.md`.

Canonical variable/config map: `docs/ferocity-env-key-checklist.md` and `.env.example`.

Customer/provider boundary: `docs/provider-account-setup.md` and `docs/customer-marketing-connector-readiness.md`.

Important non-secret identifiers are intentionally recorded in `ferocity-account-inventory.md` so agents do not reopen every provider dashboard. Update that file immediately when status, login route, callback, app ID, account ID, or recovery method changes.

## 7. Deployment, database, and release workflow

Local setup:

```powershell
npm ci
Copy-Item .env.example .env.local # then populate securely; never commit
npm run db:validate:migrations
npm run dev
```

Common focused checks:

```powershell
npm test -- --run <test-files>
npm run typecheck
npm run lint
npm run provider:truth
npm run capability:truth
npm run public:claims
npm run ui:guard
```

Required release gate:

```powershell
npm run predeploy:local
```

That gate runs public/provider/capability/UI/integration checks, migration validation, the test suite, Marketplace worker checks, typecheck, lint, and production build. Do not bypass or weaken it. If the entire gate is too slow during development, run targeted tests first, but run the full gate before release.

Database:

- Validate pending migrations before applying: `npm run db:validate:migrations`.
- Apply only after reviewing the exact pending set and the target environment: `npm run db:migrate`.
- Verify RLS: `npm run db:verify-rls`.
- Local migrations currently reach `232_listing_syndication_connectors.sql`; production was previously recorded through 231, so inspect the live ledger rather than assuming 232 is applied.
- Migrations must be additive/forward-safe. Never edit an already-applied migration to change production behavior.

Deployment:

- Netlify config is `netlify.toml`; Next.js plugin and Node 22 are required.
- Production domain is `https://ferocity.live`.
- The local `.netlify/state.json` links site ID `418ea625-bb2f-45cc-951c-33b231147ab8`; `.netlify/` is intentionally Git-ignored.
- Use preview/draft deployment for certification before production promotion.
- Record deploy ID, commit, migrations, checks, smoke evidence, and remaining human/provider certification in a dated release document.
- Never deploy the frontend without the owner's exact phrase `do front end deploy`.

## 8. Current connector/account truth

The full, current table is `docs/customer-marketing-connector-readiness.md`; account identifiers and recovery routes are in `docs/ferocity-account-inventory.md`. Do not recreate these from memory.

Snapshot at handoff:

- Meta, Reddit, Microsoft Ads, Snap Ads, TikTok Login, Microsoft mailbox/calendar, Jobber, Stripe/Stripe Connect, and several internal providers have authenticated or configured paths, but live writes/spend remain off and certification varies.
- X approved Ads API access for app `33483039` on September 30. Ferocity certification was changed to connected/testing-required with evidence; live actions remain off. A local code fix lets persisted certification override stale hard-coded approval blocking, but that fix is not deployed.
- Amazon Partner Network rejects the recovered consumer identity because its Gmail address is not a corporate-domain address. The Diamond Homes Amazon Business identity is explicitly ineligible. Confirm a working `@ferocity.live` inbound mailbox before changing the Amazon login email or submitting the partner application.
- YouTube Data API is enabled in Google Cloud project `ferocity-502105`. A read-only Ferocity OAuth flow was opened but not completed when handoff work began; do not assume a token was stored.
- Google OAuth/GBP has branding/ownership and verified Business Profile prerequisites detailed in the account inventory. Google Ads has no approved spend/campaign authorization merely because the manager account exists.
- TikTok Login, Content Posting, and API for Business are separate products. Login Kit does not authorize posting or ads. TikTok Ads remains provider-approval/certification gated.
- Snap source/credentials are staged and account discovery has evidence, but provider/campaign certification remains read-first and live off.
- LinkedIn, Pinterest, Amazon, Yahoo DSP, Apple Ads, and similar providers remain approval/account/seat dependent as documented. Do not mark them live based only on a UI account.
- OpenAI Ads has an active advertiser account/API read test, but advertiser review was still in review and billing/spend were unset.
- Zillow reported it is not accepting additional developers; keep it blocked/waitlisted rather than inventing an adapter.
- No ad campaign, public post, message blast, new billing method, or spend is authorized by this handoff.

## 9. Current unfinished work and highest-priority sequence

1. Preserve the working tree: review this handoff, run focused tests, then create a deliberate Git checkpoint without discarding any existing change.
2. The September 30 `npm run predeploy:local` gate passed. Rerun it after subsequent code changes and before an authorized release.
3. Reconcile local migrations 205-232 with production and record the live migration state.
4. Certify the public sales chat and authenticated Ferocity command layer behaviorally across multiple industries. It must reason from the user's business and desired outcome, not loop scripted intake text.
5. Certify signup → workspace → chat continuation → first useful action. Preserve conversation handoff and avoid overwhelming first-use UI.
6. Certify the lead-to-cash golden loop and core communications (calls, SMS/Connect, email, calendar), including failure recovery and human handoff.
7. Finish provider/customer OAuth in controlled read-only order. Persist account selection, encrypted tokens, revocation, refresh, audit evidence, and truthful runtime status before writes.
8. Reconcile public claims with certified production behavior. Public marketing can describe breadth but must not claim unfinished provider execution.
9. Run Ferocity internally with monitoring, then a controlled multi-industry pilot before broad paid acquisition.
10. Deploy only after the owner explicitly authorizes the frontend release.

Known immediate code/release issue:

- `src/lib/integrations/capability-truth.ts`, its test, and `src/app/app/integrations/page.tsx` contain a local change so persisted provider certification can release an old hard-coded approval block. Targeted tests passed, but production still needs a later authorized release before this runtime behavior is available.

## 10. Authoritative reading order

Read only what the task requires:

1. `AGENTS.md` and this handoff.
2. `docs/FEROCITY_REALITY_RECOVERY_AND_LAUNCH_PLAN_2026-09-27.md` — launch truth and evidence-first recovery order.
3. `docs/FEROCITY_COMMERCIAL_RESET_2026-09-26.md` — positioning, pricing, and public-site commercial decisions.
4. `docs/ferocity-account-inventory.md` — provider identities, IDs, callbacks, current blockers, and secure secret locations.
5. `docs/customer-marketing-connector-readiness.md` — customer OAuth/adapter/certification truth.
6. `docs/ferocity-env-key-checklist.md` and `.env.example` — configuration contract.
7. Domain document only when working in that domain:
   - `AGENT_AGNOSTIC_BUSINESS_ACTION_LAYER.md`
   - `CLOSED_LOOP_GROWTH_OPERATING_SYSTEM_AUDIT.md`
   - `CANONICAL_DISTRIBUTION_ENGINE.md`
   - `PROVIDER_NEUTRAL_PAID_MEDIA_ARCHITECTURE.md`
   - `LOCAL_PRESENCE_SYSTEM.md`
   - `RECEIPT_EXPENSE_INTELLIGENCE.md`
   - `NATIVE_AI_VIDEO_GENERATION.md`
   - `IN_APP_FEROCITY_VOICE.md`
   - `FEROCITY_CALLS_IMPLEMENTATION.md`
   - `FEROCITY_FACEBOOK_CONNECTOR.md`
   - `h4r-ferocity-connect-sms-handoff.md`

Older dated audit/checklist files are historical evidence. If they conflict with a newer canonical file, the newer verified runtime evidence wins; never silently delete the older record.

## 11. Efficient agent workflow

- Start with `git status --short` and inspect only files relevant to the task.
- Use `rg`/`rg --files`; avoid scanning `node_modules`, build output, logs, and unrelated historical documents.
- Before adding a table/service/provider concept, search for the existing contract, migration, registry, and action path.
- Make the smallest coherent cross-file change, then run targeted tests for those files.
- After the task works, run typecheck/lint or the appropriate readiness script; run the full predeploy gate only at release boundaries.
- Complete routine/reversible implementation autonomously once the feature is approved. Batch only genuine product, money, permission, data-loss, or external-account decisions.
- Maintain concise evidence in the relevant canonical document instead of narrating every step in chat.
- Stop long-running checks that are clearly stuck; diagnose the blocker before burning usage.

## 12. Definition of done

A Ferocity change is not done because UI or source exists. It is done when:

- tenant authorization and data boundaries are correct;
- the action uses the canonical business/provider layer;
- retries, idempotency, failures, revocation, and audit evidence are handled;
- approval/spend/public-action boundaries are enforced;
- targeted tests and relevant readiness gates pass;
- capability status and public claims are truthful;
- docs/account inventory are updated when operational truth changes;
- deployment state is explicitly recorded if a release was authorized.
