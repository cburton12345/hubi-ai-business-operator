# Ferocity 50-item acceptance ledger

Date: October 15, 2026
Release state: local/source verified; not deployed; migrations 250–252 remain unapplied

Latest lifecycle addendum: canonical estimate/job/work-order/visit/invoice/payment transitions are now serialized and fail closed; issued billing is immutable outside governed correction/payment paths; review enrollment and golden-loop persistence are atomic. Synthetic QA fixtures are explicitly prevented from granting real loop certification. Focused evidence: six lifecycle files / 24 tests plus two loop files / eight tests, targeted lint, and TypeScript. The full release gate passes 264 files / 1,052 tests, seven worker tests, full lint/typecheck, optimized production build, migration/source/provider/UI guards, and 142-trace document artifact verification. Refund/dispute/write-off and real non-synthetic A-to-Z certification remain open.

Status meanings:

- **Local certified**: behavior has executable local tests and the relevant suite passed.
- **Source ready**: implementation and safety contracts exist, but release infrastructure or a real external event is still required.
- **Provider blocked**: Ferocity is ready only to the provider's current approved capability boundary.
- **Release blocked**: production migration, environment, preview, DNS, or deployment is intentionally still pending.

| # | Capability | Status | Evidence / remaining gate |
|---:|---|---|---|
| 1 | Migration 250 review | Local certified | Dependency and rollback validation passed. |
| 2 | Migration 251 review | Local certified | Dependency and rollback validation passed. |
| 3 | Migration 252 review | Local certified | Extended credential/invocation schema validates in rollback. |
| 4 | Pre-migration invariants | Local certified | Read-only production preflight passed. |
| 5 | Post-migration certification | Release blocked | Script is ready; migrations are deliberately unapplied. |
| 6 | Release manifest | Local certified | Secret-free manifest generator is ready. |
| 7 | Netlify variables | Release blocked | Local 10/10 key check passes with the required host allowlist; production still needs explicit `MCP_ALLOWED_HOSTS`, and the Netlify app connector requires reauthentication. |
| 8 | Preview smoke | Release blocked | Guarded preview smoke exists; no preview was deployed. |
| 9 | Recovery | Local certified | Roll-forward/recovery procedure documented. |
| 10 | Full release gate | Local certified | Current combined tree passed the complete predeploy gate after this tranche. |
| 11 | Guided Connect your AI | Local certified | Optional three-step owner flow implemented. |
| 12 | Native AI default | Local certified | Explicit no-action choice; external AI is not required. |
| 13 | Muse/generic guidance | Local certified | Provider-specific copy and endpoint/header steps shown with one-time token. |
| 14 | Harmless MCP test | Local certified | UI action calls `get_business_summary` through bearer authentication and MCP. |
| 15 | Connection health UI | Local certified | Status, scopes, expiration, last use/call, calls and records today, rotate/revoke shown. |
| 16 | Daily usage limits | Local certified | Durable per-credential request and returned-record ceilings. |
| 17 | Suspicious-use detection | Local certified | Five-minute burst detection with deduplicated event. |
| 18 | Owner lifecycle notices | Local certified | Create/rotate/revoke/abnormal-use events contain no secret. |
| 19 | Readable tool preview | Local certified | Read and controlled-write groups explain protected actions. |
| 20 | OAuth + PKCE planning | Source ready | Protected-resource metadata exists; auth server intentionally not advertised yet. |
| 21 | Synthetic onboarding harness | Local certified | Progressive no-context → context → OAuth → real evidence test passes. |
| 22 | Signup/billing/workspace/invite | Local certified | Provisioning and self-serve handoff contracts included in acceptance suite; live checkout mutation not repeated. |
| 23 | Pre-signup Ask handoff | Local certified | Public transcript imports into the authenticated owner thread once. |
| 24 | Minimum missing context | Local certified | Onboarding state evaluates business context, durable owner authority confirmation, real business source, discovery, and first-value evidence separately. Provisioned defaults do not count as consent. |
| 25 | Contextual mailbox choice | Local certified | Gmail/Microsoft are recommended as one communication capability, and the onboarding focus now renders only relevant choices instead of the full integration catalog. |
| 26 | Controlled mailbox discovery | Local certified | Read-only, 25-message first discovery; no send grant. |
| 27 | Calendar discovery | Local certified | Calendar list first, owner selection, then initial inbound sync. |
| 28 | Retry/disconnect/reconnect | Local certified | OAuth return/discovery failure isolation and disconnect safety tests pass. |
| 29 | Scope vs authority | Local certified | OAuth scopes and Ferocity authority receipts remain distinct. |
| 30 | Result before completion | Local certified | OAuth alone cannot complete onboarding; real operating/receipt evidence is required. A real native record may satisfy the source requirement without forcing OAuth. |
| 31 | No reselling paid users | Local certified | Active-customer runtime explicitly carries work instead of selling Ferocity. |
| 32 | Public Ask progression | Local certified | Public prompt diagnoses, limits questioning, explains executable work, and then offers a start path. |
| 33 | Contextual CTA | Local certified | Trusted capability recommendations and platform-specific start path replace generic navigation. |
| 34 | Finished artifact link | Local certified | Chat renders stored action-receipt artifact links directly. |
| 35 | Durable progress truth | Local certified | Runs/goals distinguish active, waiting, blocked, failed, and completed states; missing results are not described as still working. |
| 36 | Several goals at once | Local certified | Round-robin bounded goal planner/throughput tests pass. |
| 37 | Status truth | Local certified | Receipts and goal/run UI distinguish inspected/prepared-equivalent evidence, completed/verified results, needs input/approval, blocked, and failed. |
| 38 | Employee English/Spanish boundary | Local certified | Language preserved; assignment rechecked; financial/payroll/owner controls excluded. |
| 39 | Mixed multi-file results | Local certified | Imported/reused/failed/pending files remain independently visible. |
| 40 | Email duplicate/project handling | Local certified | Provider retry dedupe, exact-content reuse, per-attachment durable jobs, and project batches covered. |
| 41 | Coverage/counts/totals/missing periods | Local certified | Workpaper readiness blocks partial pages/months and false totals. |
| 42 | Independent second review | Local certified | Distinct reviewer routing and disagreement/unavailable gates covered. |
| 43 | Printable tax workpapers | Local certified | Income, expenses, transfers, unresolved items, and source originals remain distinct and traceable; only preparer-ready claims are allowed. |
| 44 | Governed inbox/text/Connect | Local certified | Inbound response, reply preparation, delivery truth, Ferocity Connect queue, nonce/auth, and scheduled-text suites pass. |
| 45 | Retell inbound operating path | Provider blocked | API/agent/number/inbound webhook/transfer/callback configuration is healthy; fresh real-handset evidence is older than 30 days and must be recertified after release. Outbound remains disabled. |
| 46 | Source-ready ads discovery | Provider blocked | Provider truth accurately exposes only approved/read-ready boundaries; no campaign action was taken. |
| 47 | BYO ads/no implicit spend | Local certified | Customer-owned and managed lanes exist for 14 groups; no live lane lacks a connected state; spend remains approval/budget/live-toggle gated. |
| 48 | Role/tenant adversarial matrix | Local certified | Onboarding, employee, MCP, business-action, downloads, disconnect, operations, and provider authorization suites pass. |
| 49 | Representative platform E2E | Local certified | 67 files / 272 targeted behavior tests plus 43 workflow connection assertions passed; this is not a substitute for preview/live provider certification. |
| 50 | Production acceptance ledger | Local certified | This file is the authoritative tranche ledger; provider/release blockers are not mislabeled complete. |

## Verification performed in this tranche

- MCP tests: 25/25 passed.
- Acceptance/onboarding tests: 21/21 passed after aligning assertions to the actual implementation.
- Cross-platform targeted suite: 67 files / 272 tests passed.
- Complete repository suite: 258 files / 1,024 tests passed.
- Marketplace worker: 7/7 tests passed.
- Full ESLint and optimized 123-page Next.js build: passed.
- TypeScript: passed.
- Architecture connections: 43/43 passed.
- Provider truth: 44 providers passed (`7 certified_live`, `12 limited`, `13 connect_account`, `9 approval_blocked`, `3 fallback_only`).
- Capability truth: 22 high-risk contracts passed (`4 certified_live`, `11 limited`, `5 source_ready`, `1 blocked`, `1 planned`).
- Pending migrations 250–252: validated without persistence.
- Provider lanes: 14/14 groups include customer-owned and Ferocity-managed lanes; no unsafe live lane found.
- Provider readiness: core, Resend, seven Stripe prices, and OpenAI are healthy. Provider-specific warnings remain explicit.
- Retell read-only readiness: API, agent, number, inbound routing/webhook, transfer, compliance, and callback configuration passed. Fresh real-call evidence did not.

## Deliberately not performed

- No frontend or backend deployment.
- No DNS/TLS change.
- No migration application.
- No Netlify environment mutation.
- No live OAuth grant, external-AI credential, Muse connection, ad publication, paid campaign, customer message, phone call, or spend.
- No claim that the production surface matches the local source until preview and post-release smoke pass.

## October 15 paid-customer continuity addendum

- Paid checkout provisioning is now serialized per Stripe subscription with a transaction-scoped advisory lock. The access request stores the customer workspace ID/slug and `provisioning` checkpoint before downstream setup begins, so a provider retry resumes one workspace instead of creating another.
- Every required paid-workspace database write now fails closed. The access request is not marked `paid_and_provisioned` until the activation email succeeds; Resend's deterministic idempotency key and Stripe's retryable 500 path protect delivery retries.
- Subscription status and plan-entitlement mutations now run atomically. Stripe lifecycle events without Ferocity metadata return the matched tenant/plan and apply the same entitlement convergence instead of updating billing status alone.
- Invite acceptance now re-locks the pending, unexpired token and atomically creates/updates the app user credential, optional employee linkage, tenant membership, invite consumption, and authenticated session. Concurrent/replayed acceptance cannot leave a half-created membership.
- Verification passed: six focused files / 20 tests for paid provisioning, subscription convergence, self-serve handoff, and invite atomicity. The complete current-tree release gate also passed with 262 files / 1,039 tests, seven worker tests, TypeScript, full ESLint, optimized 123-page build, and document dependency verification across 142 server traces. No checkout, email, production row, migration, provider, or deployment was mutated.
