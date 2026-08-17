# Ferocity Earn V1 — Architecture Map and Implementation Record

Status: deployed to production, not enabled for any customer. The collection switch remains off until controlled live billing certification succeeds.

## Existing systems audited and reused

- Organizations/accounts: `tenants`, `tenant_users`, brands, workspace switching, and tenant-scoped RLS.
- Pricing/subscriptions: `billing_plans`, `billing_subscriptions`, fixed public plans, Stripe checkout, portal, and entitlement application.
- Leads/opportunities: permanent lead/customer provenance plus canonical `opportunities` and stage history.
- Service operations: canonical customers, estimates, jobs, invoices, invoice payments, and service ledger.
- Payments: manual/offline recording, Stripe Connect direct charges, payment links, provider-event receipts, refund events, and payout status.
- Provider costs: usage charges, finite usage controls, provider funding, and BYO/managed provider separation.
- Security/governance: tenant permissions, authority gates, activity logs, webhook verification, and provider idempotency receipts.
- AI/automation: existing AI workforce and workflow execution; no AI is allowed to default ambiguous attribution to 6%.

## V1 extension

Migration `186_ferocity_earn_v1.sql` adds only Earn-specific records and canonical opportunity links:

- Explicit Earn enrollment/effective date/agreement version.
- Evidence-backed opportunity attribution with the locked 0.9%, 6%, or legitimate 0% rate.
- Append-only attribution correction history.
- Approved payment exclusions.
- Immutable monetary Earn ledger with controlled settlement/dispute state changes.
- Disputes and monthly settlement statements.
- Idempotent payment assessment and refund/chargeback credit functions.
- Optional opportunity links on jobs, invoices, and payments to make every assessed dollar traceable.

No customer, lead, job, invoice, payment, subscription-history, or provider-credit system was duplicated.

## Critical rules implemented

- No existing tenant is enrolled automatically.
- No historical payment is backfilled automatically.
- Fixed plans remain available.
- Customer provenance does not determine every future opportunity.
- 6% requires an explicit Ferocity-originated opportunity with stored evidence.
- Ambiguous attribution is `NEEDS_REVIEW`, never silently 6%.
- Rates are stored as integer basis points and locked at attribution.
- Earn accrues only from succeeded/manual collected-payment records after the Earn effective date.
- Tax, tips, approved exclusions, refunds, and chargebacks reduce eligible revenue through explicit records.
- A payment and each provider event have stable database uniqueness protection.
- 0.9% and 6% cannot stack on one attribution.
- Provider usage remains outside the Earn ledger and is shown separately.
- Cancellation preserves previously attributed opportunities while blocking unrelated post-termination attribution.
- Switching from a paid fixed plan schedules Stripe cancellation at period end before Earn activates, preventing double billing.

## Customer experience

- `/app/billing/earn` shows enrollment, the exact rates, current-period statement totals, separate provider usage, upcoming settlement, opportunity-by-opportunity attribution, “Why this rate?”, projected versus accrued Earn, ledger drill-down, and disputes.
- Unclassified opportunities require a deliberate classification, reason, source/channel, and evidence.
- Platform corrections preserve the original attribution and create a ledger adjustment rather than rewriting history.
- `/pricing` presents Earn alongside—rather than instead of—the fixed plans.

## Deliberate activation boundary

- Migration 186 and the frontend are deployed to production.
- Monthly settlement preparation and the idempotent Stripe invoice runner are implemented. Paid, failed, and void invoice webhooks reconcile settlement and ledger state. External collection remains disabled by `FEROCITY_EARN_SETTLEMENT_ENABLED=false` until a controlled live certification passes.
- The QA workspace has no Stripe billing customer, and no production platform subscription currently has a stored Stripe customer reference. No fake or cross-tenant payment target was created solely to make the release gate appear complete.
- The supplied specification ends mid-sentence in provider-overage section 34. V1 therefore preserves the existing finite provider-credit and workspace overage behavior instead of inventing a new rule.
