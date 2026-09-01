# H4R ↔ Ferocity Connect SMS handoff

Last verified: 2026-08-31

## Bottom line

Ferocity Connect is a working Android/SIM SMS transport. Its queue, device authentication, pairing, delivery receipts, inbound capture, STOP/HELP handling, pacing, health isolation, and emergency controls exist and have passed a real Android 16 / Verizon outbound-delivery test.

The latest reliability layer also records exact inbound and outbound message history in Ferocity's canonical conversation timeline, preserves provider/device statuses and safe error details, alerts the workspace owner when a paired Android device stops checking in, and prepares Business Brain reply drafts for ordinary inbound SMS. Workspace owners can choose record-only, prepare-for-review, or guarded automatic replies. Automatic mode remains subject to consent, suppression, quiet-hour, provider-health, confidence, risk, and authorization checks; STOP and HELP retain their dedicated compliance behavior.

H4R is **not connected to that transport yet**. H4R currently has a setup-only connector registry and UI entry for `ferocity_android_bridge`; its production `dynamic-processor` continues to send through the existing H4R Twilio path. Do not tell anyone that H4R failover is live until the bridge, callback, routing, and controlled production tests below pass.

Once the bridge is completed, H4R can use Ferocity Connect without Twilio. SMS will be sent by the SIM in the paired Android phone, subject to that carrier plan and Ferocity safety controls.

## Canonical source locations

### Ferocity

Repository:

`C:\Users\schem\Documents\Codex\2026-05-17\are-you-familiar-with-hubi-seo`

Important files:

- Android app: `ferocity-connect-android/`
- Signed current APK: `output/Ferocity-Connect-1.0.1-production-signed.apk`
- Device-plane service: `services/ferocity-connect/`
- Provider adapter: `src/lib/messaging/providers/ferocity-connect.ts`
- Durable queue: `src/lib/ferocity-connect/queue.ts`
- Canonical messaging safety engine: `src/lib/messaging/messaging-engine.ts`
- Device API: `src/app/api/ferocity-connect/device/`
- Pairing/device control APIs: `src/app/api/ferocity-connect/`
- Workspace control UI: `src/app/app/integrations/ferocity-connect/`
- Architecture: `docs/ferocity-connect-production-architecture.md`
- Release evidence: `docs/ferocity-connect-release-evidence-2026-08-27.md`
- Release/support runbook: `docs/ferocity-connect-release-and-support-runbook.md`

Current provider key: `ferocity_connect`.

### H4R

Supabase functions and migrations source:

`C:\Users\schem\OneDrive\Desktop\homes4rent-supabase-functions-2026-07-19`

Current Netlify site snapshot:

`C:\Users\schem\OneDrive\Desktop\homes4rent-netlify-current`

Prepared H4R connector files:

- Registry migration: `supabase/migrations/202608281200_workspace_messaging_connectors.sql`
- Setup/diagnostic function: `supabase/functions/workspace-messaging-connector/index.ts`
- Current Twilio sender: `supabase/functions/dynamic-processor/index.ts`
- H4R connector UI: `homes4rent-netlify-current/app/index.html`

The existing H4R function explicitly returns: “Saved for setup/diagnostics only. Current H4R Twilio sending was not changed.” That boundary is intentional.

## Required production design

Do not let H4R call Ferocity's Android device endpoints. Those endpoints are only for a paired phone. Add a dedicated server-to-server bridge through the normal messaging engine.

1. Add a Ferocity route such as `POST /api/integrations/h4r/sms`.
2. Authenticate H4R server-side requests with a dedicated secret, timestamp, nonce, and HMAC signature. Reject stale timestamps and replayed nonces. Never expose the secret in H4R browser JavaScript.
3. Map the permitted H4R workspace to a dedicated Ferocity tenant/workspace. A dedicated H4R workspace and paired Android business phone are preferred so H4R conversations, consent, limits, and reporting do not mix with Ferocity corporate traffic.
4. Validate recipient, SMS-only body, message category, consent evidence, H4R workspace, and an immutable external message id.
5. Call Ferocity's canonical `sendMessage(...)` path with provider `ferocity_connect`; do not insert directly into `ferocity_connect_jobs` and do not bypass authorization, suppression, quiet-hours, usage, or Message Health checks.
6. Use an idempotency key such as `h4r:<workspace_id>:<sms_outbox_id>` so retries cannot create duplicate texts.
7. Return a stable Ferocity message/job reference and normalized state. Add a signed callback from Ferocity to an H4R Edge Function for `queued`, `sent`, `delivered`, `failed_retryable`, and terminal failure updates.
8. Send inbound replies and STOP/HELP events back to H4R through a signed callback. H4R's local consent/opt-out state must be updated immediately; Ferocity's canonical suppression remains in force too.
9. Store only safe error codes/details in H4R. Do not copy bridge secrets, device credentials, or message bodies into diagnostic logs.

Do not automatically enable H4R replies merely because Ferocity supports guarded automatic replies. H4R must explicitly choose its own reply mode and provide the required consent and authorization evidence. Until that is certified, return inbound messages and Ferocity-prepared reply suggestions to the intended H4R conversation for review.

Suggested server-only secrets:

- H4R Supabase: `FEROCITY_SMS_BRIDGE_URL`, `FEROCITY_SMS_BRIDGE_SECRET`
- Ferocity hosting: `H4R_SMS_BRIDGE_SECRET`

Use a database mapping for authorized H4R workspace → Ferocity tenant/device rather than a client-supplied tenant id.

## Safe routing and failover

Keep routing explicit and observable:

- `h4r_twilio_legacy` remains primary until certification finishes.
- `ferocity_android_bridge` starts in shadow/diagnostic mode, then `backup_candidate`, then owner-approved `primary` if desired.
- A provider may fail over only when the first provider definitely rejected the request before accepting it.
- Never send the same text through Ferocity Connect after Twilio returned an ambiguous timeout or provider acceptance. Reconcile status first; otherwise tenants may receive duplicates.
- Queue during an outage rather than silently dropping or repeatedly resending messages.
- Provide a global H4R messaging pause, a per-connector pause, health state, last successful delivery, last safe error, and a deliberate switch-primary action.

## Ferocity Connect operating limits

Current enforced launch controls are:

- 2 messages per minute per paired device/account
- 30 messages per hour
- 100 messages per day
- 2 messages per hour to one recipient
- 1,500 billable SMS segments per month
- automatic account isolation after 5 recent failures

These are safety limits, not unlimited capacity. Ferocity Connect currently supports SMS text only, not MMS. It does not guarantee delivery or bypass carrier rules, A2P requirements, consent law, Android permission restrictions, or carrier-plan restrictions.

## H4R integration order

1. Confirm the H4R connector migration and setup function are deployed in the correct H4R Supabase project.
2. Create the dedicated Ferocity H4R workspace mapping and decide which Android phone/SIM will be the visible sender.
3. Implement and test the signed Ferocity ingress route.
4. Implement the H4R server-side bridge adapter and delivery/inbound callbacks.
5. Add provider routing to `dynamic-processor` without replacing the existing Twilio branch.
6. Run shadow health checks with no sends.
7. Send one owner-approved test to a controlled phone and prove queued → sent → delivered.
8. Reply normally, then test HELP and STOP. Confirm both H4R and Ferocity suppress after STOP.
9. Test airplane mode/offline recovery, terminal carrier failure, duplicate invocation, callback replay, and ambiguous Twilio failure without duplicate sending.
10. Only after those tests, allow an owner/admin to designate Ferocity Connect as backup or primary.

## Acceptance gate

The H4R bridge is ready only when all of these are evidenced:

- Cross-workspace requests are rejected.
- Invalid, stale, and replayed signatures are rejected.
- One H4R outbox row creates at most one Ferocity message/job.
- The paired Android sends and the receiving phone confirms delivery.
- H4R receives delivery health and safe errors.
- Inbound replies appear in the intended H4R conversation.
- STOP blocks later H4R and Ferocity sends; HELP is visible and answerable.
- Twilio can be disabled without changing H4R workflow code or losing queued messages.
- Re-enabling Twilio does not duplicate messages already accepted by Ferocity Connect.
- Pause, revoke, offline recovery, and rollback are proven.

## Current verification evidence

On 2026-08-31, the focused Ferocity Connect, SMS policy, and messaging-engine safety suite passed: 6 test files / 24 tests. The current signed APK remains at the location above. Earlier physical certification proved a real Android 16 / Verizon send and delivered callback. Broader Android/carrier coverage remains an honest limitation documented in the release evidence.

The subsequent connector-health and inbound-reply controls are preserved in local Ferocity commit `8a04caa` (`Add connector health and inbound reply controls`). TypeScript, lint, connector readiness, syntax checks, and the focused connector/message-health suite passed after that change. This commit has not been pushed or deployed.

No deployment or H4R routing change is authorized by this handoff document.
