# H4R → Ferocity Connect bridge

## Ownership boundary

H4R prepares an outbound SMS intent and sends signed business context to Ferocity. Ferocity owns review, approval, provider selection, suppression checks, device delivery, retries, audit history, and final send status. Receipt of an H4R intent is not proof of human approval and does not bypass Ferocity policy.

## Contact controls

H4R sends these controls in `contact_controls`:

- `sms_stopped`: global H4R SMS stop. Ferocity rejects the handoff.
- `twilio_sms_stopped`: Twilio-only provider stop. Ferocity records it as context but does not interpret it as a global or Ferocity Connect stop.
- `ferocity_connect_allowed`: explicit H4R handoff permission. Ferocity rejects the handoff when false.

Ferocity's own consent, suppression, revocation, quiet-hours, policy, and device safeguards remain authoritative and can still block delivery.

## Intake and review

The signed `POST /api/integrations/h4r/sms` request is mapped to a Ferocity tenant using the server-side workspace mapping. Ferocity never trusts a callback URL supplied by H4R request content; it uses the approved HTTPS callback stored in the mapping.

Accepted intents are deduplicated with the canonical key:

`h4r:<workspace_id>:<sms_outbox_id>`

The intent enters `outbound_action_queue` as `needs_review` by default. It enters `queued` only when:

1. the workspace mapping is active;
2. an applicable Ferocity `h4r_sms_send` or `sms_send` policy is live;
3. that policy does not require human approval.

Approving a review item uses the normal Ferocity action-queue path. The processor preserves H4R callback and correlation metadata when it invokes the guarded messaging engine.

## Status and callback flow

Ferocity Connect creates and tracks the device job. Device acknowledgements and inbound replies follow the existing Ferocity Connect status routes. H4R correlation fields and the server-mapped callback URL travel with the job so Ferocity can report the resulting status without exposing message bodies in bridge diagnostics.

Retries reuse the canonical key with an attempt suffix. This prevents duplicate initial sends while allowing an explicitly approved retry to execute once.

## Compatibility

Legacy signed payloads without the three contact-control fields remain accepted for transition compatibility and are marked in stored metadata. H4R should send the nested `contact_controls` object for all new requests.
