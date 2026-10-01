# Managed phone-number lifecycle — 2026-09-07

## What is implemented

Ferocity now has a tenant-isolated lifecycle for one selected Ferocity-managed Retell number. It extends the existing phone connection, telephony number, billing subscription, Retell adapter, owner-event, push-notification, and scheduled business-automation systems.

- A number is **not** purchased merely because a workspace or subscription exists.
- The owner must choose **Get a new Ferocity number** and explicitly approve provisioning.
- Provisioning is limited to Calls, Starter, Growth, and Operator. Earn, Ferocity Connect, and Job Tracker cannot accidentally purchase a managed number.
- Provisioning waits until billing is current and both workspace voice agents are configured.
- Provisioning also requires a valid tenant-specific E.164 transfer destination and confirms that the synchronized voice agents contain that same destination. A customer call can never fall through to the Ferocity platform owner.
- Retell number creation uses the current weighted `inbound_agents` and `outbound_agents` fields.
- Newly provisioned numbers enter guided testing; customer outbound activity remains gated by the existing callback certification and live-action controls.
- A past-due account keeps full service for seven days.
- After that grace period, paid outbound calling is restricted while inbound continuity and the number are protected.
- The number is retained for 30 days for payment recovery or a verified port-out.
- Payment recovery restores the retained number and certified service automatically.
- Cancellation continues through the paid subscription term before restriction begins.
- Release requires the retention period to expire and then waits through an additional 24-hour final warning.
- A port-out request cancels queued release work and blocks automatic release.
- Provider work is stored in an idempotent lifecycle queue. A number-purchase response that is failed or uncertain is blocked for operator reconciliation instead of being blindly retried and potentially purchasing twice.
- Owners receive durable in-app events and push alerts for testing, restriction, release warning, port-out, and provider failures.

## Safety switch

`FEROCITY_MANAGED_NUMBER_LIFECYCLE_ENABLED` defaults to `false`. With the switch off, reconciliation reports what is due but performs no Retell purchase, update, or delete request. Do not enable it until migration 209 is applied and the live certification steps below are complete.

`RETELL_NUMBER_PROVIDER` defaults to `telnyx` and may be set to `twilio`. The lifecycle itself remains provider-independent; the current purchasing adapter is Retell's managed-number API.

## Required live certification after deploy

1. Apply migration 209 and leave the lifecycle safety switch off.
2. Verify the selected Retell number provider and account funding.
3. Use a controlled paid workspace to choose a managed number and confirm no purchase occurs before explicit approval.
4. Enable the lifecycle switch in a controlled window and provision exactly one number.
5. Complete inbound, callback, transfer, transcript, tenant-routing, and consented outbound tests.
6. Simulate past due and verify seven-day full service, restriction, inbound continuity, owner alerts, and the 30-day retention date without releasing the number.
7. Restore payment and verify the same number and certified outbound service recover.
8. Request port-out and verify queued release work is cancelled.
9. Exercise release only with a disposable certification number after the retention and final-warning timestamps are deliberately staged and independently reviewed.
10. Certify two simultaneous tenants and confirm number, caller context, transfer destination, transcript, usage, and billing isolation.

## Live certification status — 2026-09-07

- Migration 209 is applied and the production lifecycle switch is enabled with Retell's Telnyx-backed number provider.
- A disposable `ferocity-qa-demo` workspace was prepared as a synthetic manual Starter certification tenant. This is not a customer subscription.
- Exactly one tenant-owned managed number was purchased. It is active for inbound testing; ordinary customer outbound remains disabled until callback certification.
- Dedicated inbound and outbound agents were created and bound to the QA number. The inbound webhook, event webhook, ten-minute maximum duration, 60-second silence end, and transfer tool all point to the intended tenant configuration.
- Two authorized calls reached the verified test destination. Retell recorded 29- and 43-second calls with transcripts, summaries, and clean agent hang-up behavior.
- A real 51-second callback to the managed QA number was answered and ended normally. Retell recorded a transcript and summary, the fallback agent binding and inbound webhook configuration were confirmed, and Ferocity recorded the number's callback status as `certified`.
- The calls exposed a real release blocker: this Retell workspace uses an API credential that is not its designated webhook-signing key, so signed completion events were rejected and Ferocity's call row remained at `ringing`.
- Source now supports a separate encrypted tenant-level Retell webhook key, with the ordinary API key retained as a compatibility fallback. Focused Retell, lifecycle, and voice certification tests pass (36/36), and TypeScript passes.

## Remaining live certification

- Sign in to the QA Retell workspace, identify or designate its Webhook API Key, and store it as the encrypted tenant credential `retell_webhook_api_key`. Creating or changing that persistent key requires explicit action-time approval in the Retell UI.
- Deploy the separate-webhook-key source change only with the next authorized frontend release, then place one final controlled call and verify signed events, completed status, transcript persistence, usage metering, and setup-checklist completion.
- No real billing failure or cancellation has been manufactured. Stage past-due, recovery, port-out, and release tests only on this disposable QA number with snapshots and independent review; never on a customer tenant.
- A two-tenant simultaneous-call test still requires a second isolated number and consenting tester.
