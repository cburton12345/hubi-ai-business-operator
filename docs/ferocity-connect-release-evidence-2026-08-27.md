# Ferocity Connect predeploy release evidence — 2026-08-27

Status: release candidate prepared locally; frontend and production application not deployed.

## Proven on a physical device

- Samsung SM-S938U, Android 16, Verizon SIM paired successfully.
- Owner-authorized outbound SMS entered the canonical messaging engine, was claimed once by the intended tenant/device/SIM, sent, and received a delivered callback.
- Durable job id: `fb7d440a-6467-4ea1-b292-edaec8786bc8`.
- Message and delivery-health records were reconciled to delivered with no provider error.
- The Android receiver uploaded an inbound device event. Certification exposed and fixed a canonical-inbox conversation-reference type mismatch before release.
- A second certification message remains safely durable while the temporary local Wi-Fi endpoint/device service is unavailable; no duplicate send was created.

## Defects corrected during certification

1. Queue JSON metadata operands now cast explicitly to `jsonb`; without the cast, a real job could fail before enqueue.
2. Ferocity Connect inbound conversations now use the provider-safe string external reference and reserve the UUID thread field for real internal thread UUIDs.
3. Pairing a phone with a healthy SIM now completes the owner-authorized activation in one flow; a SIM-less phone remains paired but unable to send.
4. Android accepts a single-use `ferocityconnect://pair` link, explains restricted-permission recovery, and links directly to app settings.
5. Release signing, checksum, rollback, credential-revocation, and support procedures are documented.

## Android artifact

- Version: `1.0.1` (`versionCode 2`)
- API base: `https://ferocity.live`
- APK: `output/Ferocity-Connect-1.0.1-production-signed.apk`
- APK SHA-256: `6A4FD1FD52ADA1D4E6461001FAB4374C290657E5958B0A83FCE171B24A3FFDD4`
- Signature: APK Signature Scheme v2 and v3 verified
- Signing certificate SHA-256: `3add4ea41481b85d560f6c74fd47e393e9acc4c0227b384a8d3a1242aae74982`
- Signing key and passwords remain local under the ignored `.private` directory and must receive two encrypted owner-controlled backups before publication.

## Honest physical-device boundary

One real Android 16 handset/carrier has been certified. Android 10/12/14/15, dual-SIM, reboot, permission-revocation, prolonged offline recovery, and forced carrier-error scenarios require additional physical devices or a managed device lab. Automated tests cover the server policies and Android policy logic, but they are not represented as real-carrier evidence.

## Deployment boundary

Do not publish the APK or deploy the frontend/application until the owner explicitly authorizes step 10. After deployment, run one production pairing, outbound delivery, inbound reply, STOP, HELP, pause, revoke, offline recovery, and post-deploy customer-path certification before changing public capability wording.

## Local release gates completed

- Full Vitest suite: 123 files and 452 tests passed.
- Ferocity Connect focused suite: 5 files and 13 tests passed.
- Android: unit tests, lint, minified release build, and signature verification passed.
- Pending migrations 194–198 validated transactionally and were then applied successfully; production readiness now recognizes 198 migrations.
- RLS verification passed after migration application, including tenant-table coverage and sensitive-table grant checks.
- Public-company guard, provider-truth guard, UI guard (269 routes / 231 component files), and all 42 connected-workflow checks passed.
- TypeScript, ESLint, and the optimized 97-page production build passed.
- Provider readiness passed for launch-critical services; optional Meta configuration, Yahoo, managed voice funding/number configuration, and Twilio remain honestly connection-dependent.
- Provider-lane smoke passed all 14 capability groups.

## Step 10 hold

No Netlify deploy, deploy preview, APK publication, or production frontend activation was performed. The release candidate is stopped at the owner-approval boundary.

## SMS hardening and packaging follow-up — 2026-08-28

- The central messaging engine now meters real GSM-7/UCS-2 segments, distinguishes marketing from transactional/service messages, requires explicit marketing consent, and defers queued SMS during the contact's quiet hours.
- STOP-family and HELP-family inbound messages are recognized consistently. STOP revokes both consent stores and queues a compliant confirmation; HELP queues a support response through the same provider-independent engine.
- Ferocity Connect remains provider-independent in the action queue and retains delivery health, retry, suppression, idempotency, account isolation, and emergency-pause controls.
- Enforced launch pacing is 2 messages/minute, 30/hour, 100/day per paired device/account, 2/hour per recipient, 1,500 segments/month, and automatic account isolation after 5 recent failures. These are safety controls, not a claim of unlimited carrier capacity.
- One paired Android device is represented as included in every monthly Ferocity plan. Standalone Ferocity Connect is represented at $29/month; additional device entitlement is $10/month. Both live Stripe prices are certified, and the standalone plan now uses Ferocity's secure self-serve checkout. Additional-device purchasing remains admin-assisted until its dedicated checkout UI is certified.
- Device pairing now refuses devices beyond the workspace entitlement instead of silently allowing unbilled devices.
- Public `/ferocity-connect` messaging and the pricing page explain Android/SMS-only scope, carrier charges, consent, fair-use controls, and managed-provider alternatives without claiming guaranteed delivery or carrier-rule bypass.
- Database migrations 199-201 validated and were applied. Final Vitest: 125 files / 462 tests passed. TypeScript, ESLint, public-company guard, public-claim guard, provider-truth guard, RLS, UI guard (270 routes / 232 component files), 42 workflow integration checks, 14 provider capability groups, and a clean optimized 98-page build passed.
- Production-context provider readiness passed Resend, OpenAI through Netlify AI Gateway, voice, video, push, and all seven live Stripe prices. A live checkout session was created and immediately expired without payment as certification evidence.
- Post-build customer-path and provider-independent messaging-related smokes passed without server errors. Desktop/mobile checks of Connect, pricing, and Connect signup found no horizontal overflow or browser console warnings/errors.
- No frontend deployment was performed.
