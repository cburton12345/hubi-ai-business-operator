# Ferocity Connect production architecture

## Purpose and boundary

Ferocity Connect is an independently deployable Android transport that lets an explicitly paired workspace use a phone and SIM as an SMS route. It is not a second inbox, consent system, workflow engine, or campaign engine. Every outbound request still enters the existing Ferocity messaging engine, and every inbound message and delivery event returns to the existing conversation timeline and Message Health layer.

The provider key is `ferocity_connect`. It remains disabled until a workspace owner pairs a device, the device reports a healthy SIM, and the workspace explicitly enables live sending. A platform-wide kill switch, workspace/provider controls, the existing consent and suppression checks, and per-device pacing all have to agree before a job can be claimed.

## Existing systems reused

- `MessagingProvider` and `messaging-engine.ts` remain the only outbound entry point.
- `messaging_consents`, `messaging_opt_outs`, and `contact_suppression_list` remain authoritative.
- `messages`, `messaging_conversations`, and `recordInboundResponse` remain the canonical inbox.
- `message_delivery_events` and `recordMessageDeliveryReceipt` remain the delivery-health record.
- Existing account caps, emergency pauses, failure isolation, authorization policy, usage records, and idempotency reservations remain in force.

## Components

1. **Workspace control plane** issues one-time pairing tokens, lists device/SIM health, pauses or revokes devices, and rotates credentials.
2. **Device API** authenticates opaque device credentials over TLS, rejects expired/revoked credentials and replayed nonces, and exposes pairing, heartbeat, long-poll job claim, status, inbound, and credential rotation operations.
3. **Durable queue** stores one outbound job per canonical Ferocity message/idempotency key. Atomic claim leases prevent two devices from sending the same job. Expired leases are recoverable; terminal failures become dead-letter records requiring an explicit retry.
4. **Android app** stores its credential in Android Keystore-backed encrypted storage, discovers SIMs, claims work, sends through the selected subscription, reports sent/delivered/failed states, captures inbound SMS, survives process death/reboot, and keeps a local Room outbox for offline recovery.

## Trust model

- Pairing tokens are random, single-use, hashed at rest, expire after ten minutes, and are scoped to one tenant.
- Device access tokens are random, shown only at issuance/rotation, hashed at rest, expire, and can be revoked without affecting other devices.
- Every authenticated device request requires a unique nonce. Reuse is rejected and logged.
- A device credential derives tenant and device identity on the server. The client never supplies an authoritative tenant id.
- All queue claims and writes include server-derived tenant/device constraints.
- Device records and credentials are not readable through tenant RLS. Workspace management uses authenticated server routes; device access uses the service database connection.
- Payload logs are metadata-only. Credentials and message bodies are not copied into diagnostic/audit JSON.

## Delivery state and retry policy

`queued -> claimed -> sending -> sent -> delivered` is the successful path. `failed_retryable` returns to `queued` with exponential backoff and jitter until the configured attempt ceiling. `failed_terminal`, `canceled`, and `dead_letter` never retry automatically. A lease timeout returns an abandoned claim to the queue without creating a new idempotency key.

Carrier acceptance is not represented as delivery. Android `RESULT_OK` maps to `sent`; the delivery PendingIntent maps to `delivered`; platform and carrier errors map to normalized Message Health failures.

## Abuse and compliance controls

- No sending without existing Ferocity authorization, consent, and suppression checks.
- STOP-family keywords immediately create/update the canonical opt-out before any further automation can send.
- HELP is recorded as inbound and routed to the existing inbox.
- Per-device minute/hour/day limits, recipient pacing, quiet-hours metadata, health isolation, and the global kill switch are checked at claim time.
- Repeated permission, SIM, radio, or carrier failures auto-pause the device and create an operator alert.
- The app does not rotate SIMs to evade carrier limits, spoof sender identity, or bypass A2P requirements. Customers remain responsible for carrier-plan and legal compliance.

## TextBee study and licensing decision

TextBee demonstrates the useful product pattern: pair an Android device, expose an API-backed queue, send through the device SIM, and return inbound/status events. Its current public repository advertises an MIT license. Ferocity Connect uses those general architectural ideas only; this implementation is original and does not copy TextBee source, UI, naming, or hosted infrastructure.

## Distribution and platform risk

Google Play tightly restricts SMS permissions. The production distribution path is a signed Ferocity APK delivered from Ferocity with checksums, documented update signing, and an in-app update notification. Play distribution should be attempted only after a policy review confirms eligibility. Sideloading does not remove consent, carrier, privacy, or acceptable-use duties.

## Release gates

- Migration applied and RLS/service-role checks pass.
- Backend unit/integration tests pass, including cross-tenant and replay rejection.
- Android lint/unit tests and a release build pass in a configured Android SDK environment.
- Physical-device certification passes for Android 10 through current, dual SIM selection, offline recovery, reboot recovery, permission revocation, duplicate suppression, STOP/HELP, sent/delivered/failure callbacks, and inbound conversation continuity.
- A signed APK, SHA-256 checksum, rollback procedure, credential-revocation drill, and support runbook exist.
- No frontend deployment is part of this implementation pass.
