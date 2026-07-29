# Provider-Independent Messaging Engine

Ferocity should be the communication hub, not a Twilio app.

Communication choices use the shared configure-once preference layer documented in
`docs/configure-once-preference-architecture.md`. Voice, messaging, and email
resolve independently, and a queued action can be overridden inline without
visiting Settings.

## Current Audit

- Existing customer-visible drafts live in `communication_threads` and `communication_messages`.
- Existing approval/send work lives in `outbound_action_queue` and `outbound_delivery_events`.
- Manual SMS already exists through `/app/text-queue` and `manualSmsHref()`.
- Email send was calling Resend directly from the action page.
- Twilio SMS began as a helper under `src/lib/sms/twilio.ts`; it now resolves a tenant-owned or managed route through the central messaging router.
- Voice provider scaffolding exists separately for the AI Office Manager.

## Direction

All future communication should go through `src/lib/messaging/messaging-engine.ts`.

The engine owns:

- provider selection
- capability checks
- consent and opt-out checks
- send result normalization
- provider failure logging
- delivery usage records
- manual/native send links
- authenticated inbound and delivery webhook normalization

Twilio is the first production SMS/voice provider, but Ferocity business logic should not call Twilio directly.

## Providers

Implemented now:

- `manual_sms`: creates native SMS links for owner-assisted sending.
- `resend_email`: sends email through the existing Resend provider.
- `twilio_sms`: sends through the active tenant-owned Twilio account first, with an explicitly enabled Ferocity-managed route as fallback.
- Twilio inbound SMS and delivery callbacks: validates `X-Twilio-Signature`, resolves the tenant from a trusted active number, records idempotent events, updates conversations and delivery state, and applies STOP opt-outs.

Scaffolded:

- Sendblue
- Telnyx
- Sent.dm
- Future voice, email, and messaging providers

## Manual Sending

Manual/native SMS is a first-class path. It supports customers who:

- do not want Twilio yet
- are waiting on A2P registration
- want to reduce provider costs
- prefer to review every message
- need quick follow-up from the owner phone

Ferocity can prepare recipients, message bodies, personalization, schedules, and tracking. The owner still presses Send.

Google Voice-assisted and copy-only sending are first-class assisted methods.
They do not claim unsupported automatic Google Voice API access. Provider
failures record the original route, reason, alternatives, selection, and
outcome; automatic fallback occurs only when it was explicitly preapproved.

## Compliance Rules

The engine must check opt-outs before provider sends. AI must never override:

- STOP
- unsubscribe
- suppression list
- revoked consent

Manual sending still records outcome and attempt counts so the business does not harass people.

## Database

Migration `114_provider_independent_messaging_engine.sql` adds provider-independent tables for:

- providers
- tenant messaging accounts
- phone numbers
- registrations
- conversations
- participants
- messages
- attachments
- delivery events
- webhook events
- consents
- opt-outs
- usage
- provider failures

These tables do not remove the older communication tables yet. They prepare the clean engine while preserving current workflows.

## Live Setup

Customer-owned Twilio:

1. Save `account_sid`, `auth_token`, `from_number`, and optionally `api_key_sid`, `api_key_secret`, and `messaging_service_sid` in `/app/credentials`.
2. Set both the number's inbound messaging callback and delivery status callback to `/api/messaging/webhooks/twilio`.
3. Verify and activate the customer-owned provider from `/app/credentials`.
4. Test inbound, outbound, delivery, STOP, and error paths in the workspace.

Ferocity-managed Twilio remains a separate platform-readiness path:

1. Complete Ferocity's Twilio Primary Customer Profile and platform compliance.
2. Use `/app/messaging/twilio-isv` to track platform and customer readiness.
3. Use `/app/messaging/a2p` to collect customer registration packets.
4. Enable managed fallback only after credentials, registration, consent, budgets, and test traffic are verified.

All new SMS/email/voice actions must continue to use the provider-neutral engine, and manual sending remains available when automation is not connected.
