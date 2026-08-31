# Ferocity platform completion execution plan

Updated: 2026-08-04

Status: active engineering plan. No frontend production deployment is authorized by this document.

This is the ordered execution companion to `voice-and-final-launch-remaining-work-2026-08-03.md`. The remaining-work file retains the complete historical and launch checklist. This file controls implementation order so broad foundations, provider placeholders, and attractive screens are never mistaken for completed customer outcomes.

## Completion rule

A capability is complete only when a customer can discover it, configure it in plain language, use it successfully, understand its limits, recover from failure, and see evidence of the result.

For external providers, completion also requires:

1. a real adapter;
2. customer authorization or encrypted BYO credentials;
3. account/resource selection;
4. verified identity and capabilities;
5. tested reads and every advertised write;
6. tenant isolation and least-privilege scopes;
7. refresh, revocation, retry, webhook/sync, idempotency, and audit behavior;
8. provider cost/limit controls where usage is metered;
9. disconnection and useful fallback behavior;
10. certification evidence and truthful UI/public language.

No item passes because a table, card, form, environment variable, OAuth start route, registry entry, or draft generator exists.

## Priority definitions

- **P0 release integrity:** false-claim prevention, security, payments, tenant isolation, error recovery, and core customer paths.
- **P1 launch value:** functionality customers reasonably expect from the advertised core product.
- **P2 demand-gated integration:** useful provider/CMS adapters built after access or customer demand exists.
- **P3 advanced roadmap:** high-complexity construction, reality-capture, telemetry, or enterprise integrations that must not delay a truthful controlled launch.

## Phase 1 — P0 truth and release integrity

- [x] Create one machine-readable provider/capability truth registry.
- [x] Classify each operation, not merely each provider: authentication, read, write, webhook, reporting, publishing, spending, and fallback.
- [x] Make integration runtime/readiness and release validation consume the same truth registry; public copy reconciliation is ongoing.
- [x] Fail the release check when a planned or approval-blocked provider claims live write abilities.
- [x] Prevent credentials from changing an unimplemented adapter into a `connected` state.
- [x] Distinguish `certified_live`, `connect_account`, `approval_blocked`, `limited`, `fallback_only`, and `planned` consistently.
- [x] Reconcile native public website chat with Office Manager readiness while keeping per-website installation verification explicit.
- [x] Restore repository-wide TypeScript success after the duplicate Jobber `readOnly` field.
- [x] Run full tests, lint, build, public guard, UI guard, feature integration guard, provider truth guard, and claim guard after the changes.

## Phase 2 — P0/P1 website connection system

### Universal flow

- [x] Add a canonical website connection record separate from Google, analytics, advertising, and domain records.
- [x] Support modes: `public_scan`, `ferocity_hosted`, `cms_oauth`, `api_key`, `git_deploy`, `signed_webhook`, `install_snippet`, and `manual_export`; plugin-specific adapters remain demand-gated.
- [x] Detect likely WordPress, Wix, Shopify, Squarespace, Webflow, or GoDaddy hints during the safe public scan without claiming certainty or connected access.
- [x] Record verification method, capability scope, connection health, last verification, and errors; publishing rollback evidence remains pending.
- [x] Create one plain-language website setup UI that recommends the safest available mode.
- [x] Never request a normal account password.
- [x] Show what Ferocity can currently do: scan, capture leads, host, prepare drafts, or export without implying CMS access.
- [ ] Re-crawl after an approved change and retain verification evidence.

### Native/priority implementation

- [ ] Finish Ferocity-hosted pages: publish/unpublish, canonical, robots, metadata, structured data, and sitemap discovery are implemented; custom-domain verification and content-version rollback remain.
- [x] Add a universal snippet for lead capture and attribution and state clearly that it does not grant CMS editing; public-chat installation certification remains pending.
- [ ] Build WordPress as the first external CMS adapter after the universal contract is tested.
- [ ] Keep complete export packages as the working fallback: copy, titles, descriptions, schema, internal links, media, destination URLs, and exact placement instructions.
- [ ] Queue Wix, Webflow, Shopify, Squarespace, and custom/Git adapters by measured customer demand and provider access.
- [ ] Keep registrar/DNS adapters optional; prefer exact TXT/CNAME instructions for verification and custom domains.

## Phase 3 — P1 Google search and measurement

- [ ] Keep Google products independently authorized and independently disconnectable.
- [x] Add Search Console OAuth scopes, property discovery/selection, verification, and token refresh; explicit revocation cleanup remains pending.
- [ ] Ingest Search Analytics by query/page/country/device with bounded date windows and quotas.
- [ ] Ingest sites, sitemaps, and URL Inspection state.
- [ ] Support sitemap submission only for a property the customer controls; do not claim general-purpose instant indexing.
- [x] Add Analytics property selection and bounded 28-day traffic/conversion reads; stream-level mapping remains pending.
- [ ] Map Google properties to the correct Ferocity brand and website connection.
- [ ] Generate recommendations from connected evidence, not fabricated rank data.
- [ ] Alert on material search/traffic changes with deduplication and confidence/context.
- [ ] Preserve manual/imported reporting when Google authorization is unavailable.

## Phase 4 — P0/P1 platform operator alerts

- [x] Notify `ferocityflow@outlook.com` when a customer requests another provider.
- [x] Create one platform-alert event contract with severity, deduplication key, tenant, action path, occurrence count, notification time, and status.
- [ ] Immediate alerts: payment/checkout failure, security/abuse, customer-impacting provider outage, failed live automation, low managed-provider balance, urgent support/customer-risk event.
- [ ] Daily brief: subscriptions, cancellations, onboarding failures, cost trends, unresolved customer issues, adapter demand, and provider health.
- [x] Route provider requests and high/critical capacity events to dashboard and deduplicated email; push and remaining event families are pending.
- [ ] Add SMS only after a reliable transactional provider is certified.
- [ ] Add acknowledge, assign, snooze, resolve, and audit behavior for platform incidents.

## Phase 5 — P1 communication completion

- [x] Native public website chat API and shared-conversation path exist.
- [x] Keep one canonical support queue across authenticated forms, the public form, email guidance, and signed Retell voice intake.
- [x] Show workspace users their recent support references and statuses; alert platform admins through dashboard, email, and push.
- [x] Let the Ferocity support voice agent create a tracked case without transferring every caller to the platform owner.
- [x] Let AI support diagnose routine access, billing, integration, workflow, and technical problems first; record confirmed self-service outcomes and escalate only unresolved or protected matters.
- [ ] Run deployed production website-chat certification and reconcile its connection/status language.
- [ ] Resolve or replace the suspended managed SMS lane; retain BYO Twilio and manual/email/app fallbacks.
- [ ] Complete owner OTP and private briefing certification after transactional SMS exists.
- [ ] Certify inbound receptionist behavior separately from outbound Retell certification.
- [x] Confirm the shared 888 caller ID is an imported Retell/Twilio number and that failed callbacks never reached Retell; the suspended carrier route is the current upstream blocker.
- [x] Bind Ferocity Support as Retell's inbound fallback while retaining the dynamic inbound webhook, so a webhook timeout cannot produce a silent callback after the carrier route is restored.
- [x] Pause live outbound use of the shared 888 number while its callback path is uncertified; leave inbound support routing configured.
- [x] Prevent customer, agency, and partner workspaces from inheriting the platform 888 number when they do not have an assigned or BYO number.
- [x] Add caller-ID ownership checks and require a real, correctly routed inbound callback before a production number is eligible for outbound customer calls.
- [x] Add a callback-readiness check that can certify a number only from recent Retell inbound-call evidence, the intended agent, a nonzero connected call, the inbound webhook, and the bound fallback agent.
- [ ] Restore or move the 888 carrier route, place one real callback, and run `npm run retell:callback:readiness -- --certify` before re-enabling outbound use.
- [x] Add provider-account-wide atomic outbound Retell capacity reservations so parallel workers cannot over-launch calls.
- [x] Read the normal Retell concurrency limit dynamically and reserve 25% (five of the current twenty slots) for unpredictable inbound traffic.
- [x] Defer controlled outbound queue work with a visible estimated retry time only when the protected outbound ceiling is actually reached.
- [x] Release reservations from final call webhooks and expire abandoned reservations safely.
- [x] Route private owner briefings through the same billing, tenant-concurrency, and provider-capacity safety checks as other production calls.
- [x] Apply migrations 193-201. The database is current; the application/frontend release remains held for explicit owner approval.
- [ ] Keep shared-number multi-tenant routing and owner inbound PIN disabled until privacy, authentication, abuse, and concurrency tests pass.
- [ ] Build mailbox ingestion only after choosing Gmail/Microsoft scopes and completing OAuth review; calendar authorization must never imply mailbox access.
- [ ] Certify customer lifecycle email for sender identity, consent/unsubscribe, templates, quotas, inbound replies, and suppression.

## Phase 6 — P1 money and accounting truth

- [x] Ferocity subscriptions and a real Stripe Connect tenant invoice payment are certified.
- [x] Align full-platform managed voice overage with Ferocity Calls at 25 cents per completed minute; retain 25/100/300/500 included minutes and a 20-cent provider-cost safety ceiling.
- [x] Native invoice, ledger, purchasing, receipt, vendor-bill, expense, P&L, tax, and portable export paths exist.
- [ ] Continue refund, dispute, chargeback, bank-return, failed-payout, and support-path certification.
- [ ] Build QuickBooks OAuth/sandbox only after the canonical accounting sync contract and conflict ownership are defined.
- [ ] Start QuickBooks read/import and controlled export before any two-way automatic mutation.
- [ ] Keep payroll as time/review/export unless a certified payroll-provider adapter is added; never imply tax filing or money movement.
- [ ] Do not imply live bank feeds unless a bank-data provider is separately connected and certified.

## Phase 7 — P1/P2 marketing, reputation, and publishing providers

- [ ] Keep ad planning, creative, wallets, budgets, approvals, and attribution useful without direct provider execution.
- [ ] Build ad adapters one provider at a time after production access exists: account discovery, reporting first, then guarded campaign writes.
- [ ] TikTok Marketing API waits for the correct Business API approval/sandbox; Login Kit remains separate.
- [ ] Finish Google Business Profile read certification before adding reviewed posts, replies, media, and profile edits.
- [ ] Certify review ingestion and approved responses per provider; preserve direct review links and private recovery without APIs.
- [ ] Never allow an ad/platform connection to silently authorize spending.
- [ ] Keep live public publishing behind account, permission, approval, cost, and rollback gates.

## Phase 8 — P2 incumbent platforms and long-tail adapters

- [x] Jobber read-only OAuth/analysis exists; writes remain off.
- [x] Define Jobber call-handoff ownership: Ferocity owns the call record, transcript, recording, disposition, and retry state; Jobber receives only the tenant-approved summary/link and must never block call completion.
- [ ] Certify and implement the narrow optional Jobber call-log write-back surface. Do not use removed note mutations or manufacture fake jobs/leads; require explicit tenant opt-in, narrow scopes, idempotency, retry/dead-letter handling, and reauthorization.
- [x] Implement the shared `external_call_log` handoff contract once, with asynchronous idempotent delivery, retry/dead-letter handling, explicit tenant opt-in, contact mapping, and transcript-off defaults. HighLevel has the first native contact-note adapter; Jobber and Housecall Pro can use an owner-configured signed bridge while native provider access remains gated.
- [x] Treat HighLevel and Housecall Pro signed bridges as bridges, not native sync; HighLevel can alternatively use its separately configured native contact-note adapter.
- [ ] Obtain Housecall Pro partner access before multi-customer OAuth work.
- [x] Expose ServiceTitan as an optional signed coexistence bridge while keeping native ServiceTitan work gated to an approved enterprise/design partner.
- [ ] Publish Zapier/Make apps only after Ferocity's public action contract is stable and narrowly scoped.
- [ ] Build requested SMS/voice/AI/CMS providers through the guarded adapter process after demand and official API access are verified.

## Phase 9 — P2/P3 advanced operations and construction intelligence

- [ ] Supplier catalog/pricing/availability adapters from actual provider demand.
- [ ] Advanced route optimization only after native scheduling/dispatch data quality is proven.
- [ ] Equipment telemetry and predictive maintenance only with real device/provider data.
- [ ] Certified construction-document ingestion with page/drawing/spec citations, version control, missing-information handling, and contradiction detection.
- [ ] BIM/IFC object mapping after a canonical project/document/object model exists.
- [ ] Audio/video/photo extraction pipeline before claiming multimodal field walkthroughs.
- [ ] Drone/360/LiDAR reality capture and percent-complete verification only with accuracy benchmarks and human review.
- [ ] Never automate code, safety, contractual notice, payment, or disciplinary conclusions without the configured authority and evidence requirements.

## Phase 10 — P0 final reconciliation and release

- [x] Update the launch-critical public plans, demos, Calls, Connect, integrations, and AI receptionist claims from the truth registry.
- [x] Hide or qualify provider-dependent capabilities that are not certified in runtime cards and the public integrations/pricing language reviewed so far.
- [x] Ensure launch-facing unavailable capabilities offer a useful fallback or clear request path.
- [x] Complete realistic isolated-workspace workflow certifications for signup/checkout, public chat, estimate acceptance/deposit, Office Manager, reviews/service recovery, receptionist calls, and load/failure isolation.
- [x] Run a clean local production build and desktop/mobile visual checks for the homepage, pricing, Ferocity Connect, and Connect checkout.
- [x] Update the canonical remaining-work MD with evidence, not estimates.
- [x] Present the exact remaining external-account approvals and owner actions.
- [ ] Obtain explicit owner authorization before one frontend production deployment.

## Current working order

1. Provider truth registry and release guard.
2. Website connection data contract and UI.
3. Ferocity-hosted page completion and universal snippet verification.
4. Search Console/Analytics connections.
5. Platform operator alert contract.
6. Public-plan/readiness reconciliation.
7. Communication and accounting provider certifications.
8. Demand-gated CMS/provider adapters.
9. Advanced construction roadmap.

## Evidence log

- 2026-08-04: canonical remaining-work audit expanded from 83 to 129 tracked items.
- 2026-08-04: provider-request operator email added locally and focused adapter tests passed.
- 2026-08-04: Ferocity SEO entity/title structured data added locally and focused lint passed.
- 2026-08-04: duplicate Jobber `readOnly` type error fixed; repository-wide TypeScript check passes.
- 2026-08-04: added the provider capability truth registry, runtime enforcement, and predeploy truth guard. The old runtime no longer classifies setup-only ad/search providers as executable.
- 2026-08-04: added tenant-scoped website connections with safe public verification, explicit connection modes, capability display, and disconnect behavior; migration 175 applied.
- 2026-08-04: completed read-only Search Console and GA4 property discovery/selection, token refresh, bounded daily sync, UI, and mocked adapter tests; migration 176 applied.
- 2026-08-04: added deduplicated platform-owner alerts with dashboard/email routing for provider requests and capacity risk; migration 177 applied.
- 2026-08-04: migration validation, provider truth guard, repository typecheck, lint, and focused Google reporting/OAuth tests pass.
- 2026-08-04: corrected the Office Manager website-chat seed and existing rows; added hosted-page self-canonicals, LocalBusiness/Service JSON-LD, and dynamic indexable sitemap entries; migration 178 applied.
- 2026-08-04: complete verification passed: 86 test files / 301 tests, production build (69 static pages generated), TypeScript, lint, public-company guard, UI guard (232 routes), feature integration guard (41 workflows), public-claim guard, and provider-truth guard.
- Frontend production deployment: not performed during this work.
- 2026-08-16: completed predeploy items 6–10 locally. External call-log delivery/retry/dead-letter tests pass; no customer bridge is enabled yet, so real-provider write-back remains unclaimed.
- 2026-08-16: Stripe Connect is active with payouts enabled and the prior $1 certification payment is paid. Earn V1 is implemented and security-hardened locally; external Earn settlement remains gated behind controlled live certification.
- 2026-08-16: the isolated QA business loop is certified across all 13 stages with zero handoff gaps and no live provider actions.
- 2026-08-16: local load, provider-failure isolation, RLS, dependency, claims, UI, integration, migration, and production-build checks pass. Current production routes also pass read-only smoke testing.
- 2026-08-16: frontend production deployment was still not performed; explicit owner approval remains required.
- 2026-08-28: migrations 193-201 are applied. Ferocity Connect has certified live Stripe products for the $29/month standalone plan and $10/month additional-device entitlement; standalone Connect uses the standard secure self-serve checkout. The additional-device purchase UI remains admin-assisted and is not represented as one-click self-service.
- 2026-08-28: corrected managed OpenAI routing to honor Netlify AI Gateway's injected base URL while retaining direct OpenAI routing for workspace BYO keys. A production-context 11-token completion using `gpt-4.1-mini` passed, and the launch provider check now passes all required providers and all seven live Stripe prices.
- 2026-08-28: final local gate passed 125 test files / 462 tests, TypeScript, ESLint, migration validation, RLS, provider truth (30 providers), public claims, UI integrity (270 routes / 232 components), 42 connected workflows, 14 provider capability groups, and an optimized 98-page build.
- 2026-08-28: the final health review exposed and corrected a transactional-email idempotency collision that could suppress later signup/welcome emails. Keys are now deterministic per tenant, event, recipient, subject, and body; identical retries reuse a key while different messages cannot collide. The affected customer signup path passed again with zero new error/critical events.
- 2026-08-28: post-build customer-path, public-chat, estimate, Office Manager, review, receptionist-call, and load smokes passed. Two load gates completed 280 total requests at concurrency 12 with zero failures. Desktop/mobile visual checks found no horizontal overflow or console warnings/errors on the homepage, pricing, Ferocity Connect, or Connect checkout.
- 2026-08-28: remaining launch boundary is external/post-deploy rather than unfinished core code: explicitly approve the single application/frontend deployment, then run production signup/payment/webhook, production Connect pairing/outbound/inbound/STOP/HELP/pause/revoke/offline recovery, production website chat, and monitoring checks. Microsoft advertiser identity, restored/shared-number callback certification, Jobber authorization, TikTok authorization, and other provider approvals remain optional capability gates and are not represented as core-live.
