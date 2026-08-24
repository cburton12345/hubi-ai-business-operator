# Ferocity operational trust implementation

Status: implemented locally and verified; migration 192 is pending. No frontend or production deployment was performed.

## Existing systems reused

- `outbound_action_queue`, live-action policies, approvals, plan/service gates, consent and suppression records remain the execution authority.
- Provider accounts, provider connection lanes, tenant messaging accounts, voice routes, connector runtime, integration connections, and provider adapters remain the provider/integration sources of truth.
- Message Health remains the source of delivery receipts, normalized provider status, error codes, suspicious filtering, retry, and manual recovery.
- Operator Timeline, Activity Logs, Owner Command events, alerts, AI agent runs, integration dead letters, and Growth events remain the primary user-visible audit/escalation systems.
- The scheduled business-automation runner remains the only shared runtime loop. No second scheduler or action queue was added.
- Existing platform-capacity monitoring, provider funding alerts, messaging emergency pause, message failure breaker, retry paths, tenant limits, feature flags, and per-tenant error isolation remain intact.

## Extension added

Migration `192_capability_trust_and_execution_health.sql` adds four provider-independent records:

1. Capability trust profiles: per-tenant, per-capability trust, health, emergency pause, enforcement rollout, outcomes, corrections, and owner-controlled promotion.
2. Capability dependencies: provider/integration/feature/webhook/configuration/consent/queue dependencies with structured health and reasons.
3. Capability execution audits: an evidence envelope linked to the existing action queue, with exact state, initiator, authorization basis, dependencies checked, provider evidence, outcome evidence, retries, fallbacks, expected events, and timestamps.
4. Capability circuit breakers: tenant/capability/provider or integration scoped failure protection with closed/open/half-open state and recovery probes.

This is not a second execution architecture. It wraps existing execution with verifiable readiness and evidence.

## Capability and health behavior

Capability trust levels are `unverified`, `observing`, `assisted`, `trusted`, and `autonomous`. Health states are `healthy`, `degraded`, `unavailable`, `configuration_required`, `verification_required`, `rate_limited`, `suspended`, and `unknown`.

Profiles start in observe-only enforcement mode so the new layer can measure the current production behavior without silently breaking existing authorized workflows. Switching a capability to enforcement is an explicit rollout decision. Emergency pause always fails closed.

The action runtime checks the selected tenant provider, credentials, live-action status, outbound enablement, emergency pause, provider lane, and open circuit breaker. Existing channel-specific engines still enforce phone/email destination, consent, opt-out, registration, number, budget, velocity, and provider-specific rules.

## Truthful execution

The reliability envelope distinguishes:

`planned -> queued -> attempted -> provider_accepted -> delivered/confirmed -> completed`

and the non-success states:

`failed`, `blocked`, `needs_attention`, `delayed`, and `unknown`.

Provider acceptance is not delivery. Message delivery is promoted only by Message Health receipt evidence. Voice calls are confirmed/completed only by the verified voice webhook. Expected receipts or completion callbacks that do not arrive are moved to delayed and then owner attention by the watchdog.

## Fallback and circuits

Automatic fallback is eligible only for provider outage, retryable provider failure, or rate limiting, and only when the alternate is configured, authorized, healthy, and consent remains valid. It cannot bypass consent, opt-out, compliance, invalid destination, content policy, authorization, configuration, authentication, or account suspension.

Repeated provider failures open a scoped circuit after the threshold, stop trusted/autonomous operation from continuing at the old trust level, and create an owner-visible regression. A circuit cannot raise a lower trust level. Recovery uses half-open probes.

## Progressive trust and corrections

Successful evidence may generate a one-step promotion recommendation, but promotion is never automatic. Only a workspace owner (or platform super-admin) can accept a healthy, recommended one-step increase. Consequential actions still require explicit human approval.

Health failures, outcome failures, open circuits, or a meaningful correction rate can automatically regress trust. A correction is recorded only for an explicit `changes_requested` decision with notes in the currently integrated Growth approval path; ordinary edits and rejections are not automatically treated as AI failure.

## Owner and AI surfaces

Owner Command now shows a compact operational-trust section: healthy/attention/paused counts, 30-day reliability metrics, capability health, trust level, reason, recommendation, evidence link, and emergency pause/resume.

AI Workforce shows the same capability-specific truth. Commands that produce customer-facing work still flow into the existing queue, where readiness, authorization, provider evidence, and outcome evidence are applied before the system can claim completion.

Automation Timeline now includes capability execution evidence and exposes the exact provider-independent action state instead of flattening everything into “done.”

## Metrics

The 30-day view reports actions, verified success rate, provider/action failure rate, blocked work, delayed/unknown work, retries, fallbacks, and meaningful owner corrections. Existing provider failures, message health, webhook logs, integration jobs/dead letters, platform capacity, and alerts remain available for deeper diagnosis.

## Automated verification

Tests cover readiness, missing dependencies, verification-required state, observing/assisted authorization, consequential-action fail-closed behavior, valid and invalid state transitions, provider evidence, late evidence, retries, circuit opening/recovery, eligible fallback, prohibited fallback, promotion recommendations, automatic regression, corrections, tenant isolation/RLS contracts, audit linkage, queue wrapping, receipt integration, and scheduled watchdog integration.

## Dogfood sequence before external enforcement

1. Apply migration 192 in the controlled release window.
2. Keep all new profiles in observe enforcement and run Ferocity's own business for at least one normal cycle.
3. Confirm selected-provider dependency snapshots match actual provider/account state.
4. Run one approved message and verify `provider_accepted` followed by real `delivered` receipt.
5. Run one approved voice call and verify provider acceptance followed by confirmed/completed webhook evidence.
6. Disable or expire a test provider connection and verify configuration/verification blocking and owner escalation without a live customer action.
7. Exercise an explicit retry with a new idempotency key.
8. Simulate retryable provider failure in the test harness and verify only an authorized fallback is prepared.
9. Verify consent/opt-out/account-suspension failures never trigger provider bypass.
10. Let a test expected event expire and verify delayed then needs-attention behavior.
11. Turn enforcement on for one low-risk internal capability, then progress through assisted use before considering trusted use.

## Remaining gaps before broad external autonomy

- Apply migration 192 and run the full staging/production migration and RLS checks.
- Certify real webhook recency for every provider intended for launch; the generic model exists, but not every adapter currently emits a dedicated webhook-health dependency.
- Add provider-specific readiness probes for calendar read/create/timezone, payment reconciliation/refund/dispute paths, sending-number validity, messaging registration, and transfer configuration where those providers are enabled.
- Expand capability execution envelopes beyond the outbound communication queue to direct calendar, payment, publishing, ad-spend, destructive account, and high-value pricing actions before granting those capabilities trusted/autonomous status.
- Feed explicit meaningful corrections from estimate, scheduling, pricing, and classification review flows as those review paths are certified.
- Run tenant-isolation integration tests against an applied database, not only schema/source contracts.
- Establish per-capability thresholds from dogfood evidence; do not use generic success counts to promote consequential capabilities.
- Keep experimental connectors observing/assisted and hidden from broad autonomy until their real provider-result and disconnection tests pass.
