# Communications Provider-Risk Audit

Date: July 29, 2026

## Decision

Ferocity does not need a communications redesign. The existing provider-independent
messaging engine, tenant-owned account records, credential vault, action queue,
consent/suppression records, and provider adapters are the correct foundation.

The necessary work is a narrow hardening pass:

1. enforce approval and consent inside the central messaging engine so no caller
   can accidentally bypass them;
2. add configurable short-window limits and recipient-frequency protection to
   the existing tenant messaging account;
3. automatically isolate a tenant after a provider-failure burst;
4. reuse `spend_limits` for platform/tenant/provider emergency shutdowns;
5. expose a tenant emergency-pause control on the existing Messaging page.

No existing conversations, messages, phone numbers, provider credentials,
workflows, registrations, routes, delivery history, or usage records are replaced.

## 1. Protections Already Implemented

- All messaging records carry `tenant_id`.
- Messaging, registration, phone-number, consent, opt-out, usage, delivery,
  failure, and conversation tables have row-level-security policies.
- Provider credentials are tenant-scoped, AES-256-GCM encrypted, fingerprinted,
  never returned in plaintext, and server-only at the database privilege layer.
- Customer-owned Twilio and Ferocity-managed Twilio are separate ownership lanes.
- Live sends require an active account with configured credentials, outbound
  permission, and `live_sending_enabled`.
- The main action-queue processor requires an approved action or an explicitly
  live policy and checks legacy consent before sending.
- The central engine checks service/plan availability, monthly unit limits,
  monthly provider-cost limits, opt-outs, and the legacy suppression list.
- Sends are idempotently reserved in the existing `messages` table.
- Provider failures, outbound messages, usage, estimated provider cost, delivery
  updates, rebilling review items, and authenticated webhook receipts are logged.
- Twilio webhooks resolve a tenant through a trusted active number, verify the
  tenant's Twilio signature, deduplicate provider events, and record STOP-family
  opt-outs.
- The generic provider webhook uses timestamped HMAC authentication and replay
  protection.
- Twilio ISV records already model a subaccount/customer-profile/brand/campaign/
  Messaging-Service/number route per customer. The product explicitly warns
  against sharing one A2P campaign across unrelated businesses.
- Manual/native SMS remains available without tying business workflows to Twilio.
- Telnyx, Sendblue, Sent.dm, Google Voice assisted, and future providers already
  fit the existing `MessagingProvider` adapter contract.

## 2. Existing Provider Abstraction

Business workflows call `sendMessage()` in
`src/lib/messaging/messaging-engine.ts`. Provider-specific code sits behind the
`MessagingProvider` interface and the provider registry.

The engine owns policy, routing entry, suppression, logging, metering, and
idempotency. Twilio and Resend own only provider transport details. This is the
correct boundary and should be preserved.

## 3. Tenant And Credential Isolation

- Every provider/account/number/message/usage/failure query is tenant-scoped.
- BYO Twilio credentials are resolved from the tenant credential vault.
- Managed parent-account credentials remain in server environment secrets.
  Customer-specific managed Twilio webhook credentials remain encrypted in the
  tenant vault and are not shared between tenants.
- Customer-owned Twilio is selected before a managed fallback.
- Managed Twilio ISV routing is designed for one subaccount or Messaging Service
  per customer rather than one shared campaign.
- Phone-number webhook routing maps the inbound number to one tenant before
  loading credentials or writing messages.

## 4. Actual Gaps

### High priority

- Consent is checked by the main queue and one manual email path, but not by the
  central engine. Another valid caller can reach the engine without a consent
  check.
- Approval is represented in workflows, but the central engine does not require
  callers to attest which approved policy or user action authorized the send.
- Only monthly account limits exist. There is no hourly, daily, per-recipient, or
  provider-failure burst circuit breaker.
- `spend_limits.emergency_paused` exists but the messaging engine does not honor
  it.
- There is no simple tenant emergency-pause control on the Messaging page.
- Managed Twilio must remain disabled until every customer has an approved,
  customer-mapped ISV/A2P route. The database model exists; live provisioning is
  still provider-account work.
- The previous managed Twilio resolver could fall back to one platform sender.
  It must instead require the tenant's active subaccount, Messaging Service or
  number, and tenant-specific webhook token.

### Lower priority

- Strict atomic reservation for velocity limits would be useful at very high
  parallel send volumes. The existing idempotent message reservation prevents
  duplicate sends, while the new short-window limits cover the current launch
  scale.
- A content-classification abuse model could supplement deterministic signals
  later. It should not replace consent, opt-out, registration, or rate controls.
- Telnyx and other providers need concrete adapters only when demanded; their
  addition does not require core-engine changes.
- A platform-operator control panel for global `spend_limits` can be added after
  the first managed-messaging customers. The database-level global stop is enough
  for launch operations.

## 5. Now Versus Later

### Implement now

- Central approval and consent enforcement.
- Hourly, daily, per-recipient, and recent-failure limits on the existing tenant
  messaging account.
- Automatic tenant isolation after a failure burst.
- Global/tenant/feature/provider emergency-stop evaluation using existing
  `spend_limits`.
- Tenant pause and safe-clear controls using the existing Messaging page.
- Specific risk categories in the existing provider-failure log.
- Tenant-specific managed Twilio subaccount/sender/webhook resolution with no
  shared-number fallback.

### Implement later

- Provider-specific Telnyx/Sendblue/Sinch adapters as customer demand justifies.
- Automated Twilio ISV provisioning after the platform profile is approved.
- Advanced statistical/content abuse detection.
- Strict serialized velocity reservations for unusually high-concurrency bulk
  sending.
- A dedicated internal platform-operator screen for global emergency controls.
