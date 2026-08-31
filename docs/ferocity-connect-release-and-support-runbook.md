# Ferocity Connect release, rollback, and support runbook

## Release boundary

Ferocity Connect is an optional Android SMS transport. It never bypasses Ferocity authorization, consent, suppression, quiet-hours, pacing, provider-health, or emergency-pause controls. Production deployment and public download publication require explicit owner approval.

## Signed release procedure

1. Keep the release keystore and passwords outside Git. Maintain two encrypted backups controlled by the company owner.
2. Run Android unit tests and lint, then build the release APK with the production API base URL `https://ferocity.live` and the dedicated release signing configuration.
3. Verify the APK signature and record its SHA-256 checksum, version code, version name, build UTC time, and source commit.
4. Publish the APK and checksum together only from the authenticated Ferocity download page over HTTPS.
5. Install over the previous signed build on a controlled phone. Confirm credentials and the encrypted event outbox survive the update.

## Rollback

- Application rollback means republishing the last known-good APK signed by the same key. Android will not install a lower version code over a newer build, so issue the known-good source with a new higher version code.
- Server rollback means disabling new pairing and sending with `ferocity_connect_service_control` before reverting application code.
- Never rotate or discard the signing key during an incident. Losing it makes in-place updates impossible.
- Preserve queued jobs. Pause claims instead of deleting messages or device records.

## Credential and device incident

1. Pause the device or global service control immediately.
2. Revoke the affected device credential. Confirm a revoked credential cannot heartbeat, claim, upload inbound messages, or rotate itself.
3. Review device events, message delivery events, operator alerts, and recent jobs without exposing message bodies or credentials in support logs.
4. Pair a replacement device with a new single-use token. Never reuse or extend the compromised token.
5. Resolve the incident only after a controlled send and delivery receipt succeed.

## Customer support triage

- **No permission:** guide the customer to Android app settings, allow restricted settings when Android requires it, return to Ferocity Connect, and grant the requested SMS/phone/notification permissions.
- **No SIM:** confirm an active SIM is visible and select the intended SIM. Do not rotate SIMs to evade carrier controls.
- **Offline/stale:** confirm power, internet, mobile service, foreground notification, battery restrictions, and the last heartbeat.
- **Queued:** preserve the job; verify the device is active and wait for connectivity. Do not create duplicate sends.
- **Failed:** use the safe Android/carrier reason, correct the cause, and use the explicit retry action. Never silently loop terminal failures.
- **STOP/HELP:** STOP-family messages must suppress future automation immediately; HELP must remain visible in the canonical inbox for response.

## Customer-facing truth

Ferocity may say that an eligible paired Android phone can automatically send and track approved business SMS. Do not claim unlimited sending, guaranteed delivery, carrier approval, Google Play availability, or a complete replacement for a telecom provider.

## Packaging and launch limits

- One paired Android device is included in each monthly Ferocity plan.
- Standalone Ferocity Connect is $29/month for one device after manual activation; additional device entitlement is $10/month per device.
- Do not advertise instant standalone checkout until the dedicated Stripe product and webhook path pass live certification.
- Default launch controls are 2 messages/minute, 30/hour, 100/day, 2/hour to one recipient, 1,500 segments/month, and account isolation after 5 recent failures.
- These values are conservative safety controls. Raise them only from observed delivery quality and carrier/account health, never merely because a customer requests “unlimited” sending.
