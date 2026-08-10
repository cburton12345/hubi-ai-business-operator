# Message Health live certification

Use this checklist after the owner-authorized release. It certifies provider behavior without changing Ferocity's provider-independent messaging architecture.

## Rules

- Use an isolated QA workspace and test recipients controlled by Ferocity.
- Never use a customer tenant, customer recipient, or customer-owned provider account for platform certification.
- Confirm the tenant ID on every message, receipt, failure, alert, retry, and conversation record.
- Do not enable automated sending merely because credentials exist. The account must be connected, active, outbound-enabled, live-enabled, and not paused.
- Preserve the original failed message. A retry must create a new message with a new idempotency key and explicit retry lineage.
- Stop immediately if consent, opt-out, tenant isolation, spend controls, or emergency pause behaves unexpectedly.

## Common checks for every automated provider

- [ ] Provider account and sender identity are production-approved.
- [ ] Required webhook events point to the newly deployed handler.
- [ ] Webhook authentication rejects an invalid signature or secret.
- [ ] A valid send creates one tenant-scoped outbound message.
- [ ] Accepted/queued/sending/sent receipts normalize without losing raw status.
- [ ] Delivered receipt marks the message delivered and resolves its delivery alert.
- [ ] Failed/rejected/undelivered receipt preserves the safe provider reason and code.
- [ ] Replaying the same provider event does not create a duplicate delivery event.
- [ ] An older non-final receipt cannot reverse a newer final receipt.
- [ ] The conversation timeline shows the current state, provider, update time, safe reason, and prior events.
- [ ] Same-provider retry creates a new linked attempt.
- [ ] Alternate-provider retry re-runs consent, account health, limits, capability, and approval checks.
- [ ] Retry is unavailable after three linked attempts.
- [ ] Emergency pause prevents the provider from sending.
- [ ] A second QA tenant cannot read or mutate the first tenant's messages, receipts, alerts, or retry lineage.
- [ ] Usage and provider cost are attributed to the correct tenant.

## Twilio SMS/MMS

Status: code-ready; customer BYO lanes may be connected independently; the Ferocity-managed lane remains blocked while the provider account is suspended.

- [ ] Certify one customer-owned QA Twilio lane without using Ferocity-managed credentials.
- [ ] Verify inbound message and delivery-status callbacks on the shared Twilio webhook route.
- [ ] Certify delivered and controlled undelivered outcomes.
- [ ] Verify filtering language appears only when Twilio supplies filtering evidence such as error 30007, 30038, or 30039.
- [ ] Verify STOP prevents future automated sends across configured providers and HELP returns the configured help path.
- [ ] Re-run A2P/sender-registration checks before any managed production lane is enabled.

## Resend email

Status: sending and normalization are code-ready; production webhook subscriptions must not be expanded until the new handler is deployed.

- [ ] After deployment, add `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.failed`, and `email.suppressed` to the existing production webhook.
- [ ] Preserve `email.received` on the same existing webhook.
- [ ] Certify sent, delivered, delayed, bounced, failed, and suppressed receipts.
- [ ] Verify the provider email ID maps to exactly one tenant message.
- [ ] Verify an unknown provider email ID is safely acknowledged without cross-tenant lookup or mutation.

## Manual SMS fallback

Status: available without a messaging provider; Ferocity cannot claim delivery tracking after handoff unless the device/provider reports it.

- [ ] The handoff opens the device composer with the intended recipient and message.
- [ ] Ferocity labels the item manual-ready/sent manually rather than provider-delivered.
- [ ] The UI makes clear that provider delivery receipts are unavailable after handoff.
- [ ] Manual fallback remains available when automated providers are unavailable or paused.

## Release evidence

Record the deployment ID, commit, tester, UTC time, QA tenant, provider account identifier (never a secret), test message IDs, webhook event IDs, screenshots, outcomes, and any remediation. Link that evidence from the master launch checklist before changing public capability wording.
