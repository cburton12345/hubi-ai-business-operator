# Context-Aware Growth and Learning

## What changed

Ferocity no longer treats every lead older than one day as the same stale lead. The lifecycle planner now uses:

- lifecycle stage, priority, lead score, source, and inactivity;
- the original request, service interest, urgency, and recorded loss reason;
- available channels and verified contact consent;
- prior nurture/reactivation touches;
- active inbound-response stops and open conversations.

The planner selects a segment, channel, due time, strategy, sequence step, deterministic test variant, confidence score, and grounded draft. It never sends directly. Approval and the provider-independent messaging engine remain authoritative for consent, suppression, quiet hours, velocity, cost, provider health, and idempotency.

An active conversation suppresses nurture. Four outreach attempts in 180 days trigger the default frequency cap. No verified consent produces a manual review task, not a customer message.

## Ethical persuasion

Organic-content quality now blocks manufactured urgency and coercive language in addition to unsupported claims and unsourced content. Verified urgency can be used when it is real. Generation instructions explicitly favor relevance, useful specificity, verified proof, clear options, and proportionate calls to action while prohibiting shame, fear, pressure, fake scarcity, fake social proof, and dark patterns.

## Learning loop

`lifecycle_strategy_outcomes` reconciles each prepared strategy with canonical outcomes:

- reply;
- qualification;
- booking/job creation;
- win;
- opt-out;
- attributed collected revenue.

The resulting strategy evidence is written to the existing tenant-and-brand-scoped Marketing Memory. Small samples remain `needs_more_data`; observed results are never described as proven merely because content was generated or sent.

Inbound replies immediately stop related pending actions and mark matching measured strategies as replied. Periodic lifecycle reconciliation catches later bookings, wins, opt-outs, and revenue.

## Cross-customer learning and privacy

Private learning is enabled per tenant through existing Marketing Memory. Cross-tenant learning is **disabled by default**.

An owner/admin may explicitly enable `cross_tenant_learning_consents`. Only aggregate counters are contributed—no names, contacts, messages, prompts, documents, record IDs, or raw customer content. A playbook is eligible only after at least five opted-in tenants and fifty samples are represented. The thresholds are enforced in the aggregation query and database constraints.

This provides the intended two layers:

1. private company intelligence for the specific business;
2. optional, de-identified cohort intelligence for reusable Ferocity playbooks.

## Files

- `src/lib/customer-lifecycle/follow-up-intelligence.ts`
- `src/lib/customer-lifecycle/prepare-context-aware-followups.ts`
- `src/lib/customer-lifecycle/refresh-lifecycle-learning.ts`
- `src/lib/customer-lifecycle/sync-customer-lifecycle.ts`
- `src/lib/messaging/record-inbound-response.ts`
- `src/lib/marketing/organic-publishing-policy.ts`
- `src/lib/marketing/ai-content-production.ts`
- `supabase/migrations/221_context_aware_growth_learning.sql`

## Release requirements

1. Apply migration `221_context_aware_growth_learning.sql` before deploying application code that writes these records.
2. Run unit tests and the production build.
3. After deployment, certify one consented nurture flow, one inbound-reply stop, one frequency-cap case, and one booking/win outcome reconciliation.
4. Do not enable cross-tenant contribution for any workspace without affirmative owner/admin consent.
