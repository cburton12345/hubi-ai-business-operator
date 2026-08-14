# Ferocity Calls implementation

Standalone plan: **$49/month + $0.25 per completed voice minute**.

Ferocity Calls remains part of the existing Ferocity tenant, identity, Business Brain, contacts, leads, scheduling, communications, provider, usage, and billing systems. This checklist intentionally does not create a separate application or duplicate those systems.

## Core call lifecycle

- [x] Preserve the complete normalized provider event through the voice webhook.
- [x] Resolve inbound callers against tenant customers and leads before Retell answers.
- [x] Supply business, contact, service, service-area, scheduling, and escalation context to Retell.
- [x] Reconcile caller identity and upsert the appropriate lead/customer after the call.
- [x] Normalize provider-specific outcomes into Ferocity call dispositions.
- [x] Persist transcripts, consent metadata, recording references, summaries, outcomes, and provider cost.
- [x] Meter every final chargeable call idempotently, including later duration/cost reconciliation.
- [x] Record what Ferocity did and why.

## Voice actions

- [x] Route appointment requests through shared availability and conflict rules.
- [x] Execute configured Retell transfers and human escalation while the call is active.
- [x] Add signed tools for lead/contact updates, booking, transfer, and follow-up.
- [x] Provision both inbound and outbound agents for every connected Calls workspace.
- [x] Execute approved queued outbound voice calls.

## Follow-up and owner awareness

- [x] Create post-call actions idempotently.
- [x] Use configured automatic SMS/email providers when consent allows.
- [x] Fall back to manual-device SMS or owner review when an automatic provider is unavailable.
- [x] Notify the owner for urgent, high-value, failed, or unresolved calls.
- [x] Preserve delivery health and retry options in the existing conversation timeline.

## Product and billing

- [x] Add `calls` as a first-class plan and entitlement set.
- [x] Add the Stripe Calls price configuration.
- [x] Bill voice usage at 25 cents per rounded completed minute.
- [x] Show call-level customer usage and protected call history clearly.
- [x] Handle past-due service with a short take-a-message mode instead of a silent call.
- [x] Upgrade an existing Calls subscription without a second subscription or data migration.
- [x] Give Calls users a focused navigation shell backed by the same Ferocity data.

## Certification

- [x] Unit-test provider normalization, caller context, disposition mapping, and billing policy.
- [ ] Test inbound new lead, inbound existing customer, booking, transfer, missed call, recording, and owner alert.
- [ ] Test outbound approved call and post-call updates.
- [ ] Test BYO Retell, Ferocity-managed Retell, BYO Twilio SMS, manual SMS, and email fallback.
- [x] Verify current RLS/permissions and sensitive-table grants.
- [ ] Live-test payment failure, subscription upgrade, concurrency, and provider failure after release configuration is applied.
- [x] Run typecheck, lint, targeted tests, production build, and non-persisting migration validation.
- [x] Run current production and provider readiness checks without changing the deployment.
- [ ] After deployment configuration is available: run live end-to-end certification.

## Release handoff (not performed)

- [x] Create the live Stripe recurring price for Calls and set `STRIPE_PRICE_ID_CALLS`.
- [x] Apply migrations `182_final_homepage_positioning.sql` and `183_ferocity_calls_plan.sql`.
- [x] Deploy the reviewed application once deployment is explicitly approved.
- [x] Re-sync the Retell inbound/outbound assistants so the new signed business tools use the deployed URL.
- [x] Enable inbound calling only after the new webhook and restricted-mode behavior are deployed.
- [x] Verify the deployed signed inbound route accepts the configured number, selects the correct assistant, and rejects invalid signatures.
- [ ] Complete one answered inbound call and one consented outbound call with a human tester, then verify transcript, summary, usage, appointment/transfer behavior, and owner alert evidence.

## Separate provider account maintenance

These items do not block Ferocity Calls itself, but the platform must not present them as healthy until reauthorized:

- [ ] Reauthorize Jobber; its stored access token is expired and the provider rejected the stored refresh token.
- [ ] Reauthorize TikTok; its stored access token is expired and the provider rejected the stored refresh token.

## Explicitly excluded

- Separate Calls codebase or database.
- Duplicate CRM, Business Brain, scheduler, communications history, or billing engine.
- Mandatory Twilio voice dependency.
- Custom SIP carrier infrastructure.
- Unapproved cold-call automation.
- Full job execution, accounting, payroll, inventory, or marketing features inside the Calls entitlement.
