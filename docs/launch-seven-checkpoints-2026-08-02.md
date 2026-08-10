# Ferocity launch: seven remaining checkpoints

Updated: 2026-08-02

Frontend deployment remains locked until the owner explicitly authorizes it.

## 1. Local release and visual gate — PASS

- 267 automated tests pass across 77 files.
- Type checking, linting, production build, public-data guard, UI guard, and 41-workflow integration guard pass.
- Production readiness recognizes 171 migrations and 113 required launch artifacts.
- A 160-request local load test completed with zero failures (p95 727 ms).
- Homepage and demo were visually checked at desktop and mobile widths with no horizontal overflow.
- Both pages use a safe static product walkthrough until a stronger final video is approved.
- The 44-second narrated Business Loop motion demo remains an internal draft and is not approved for release.

## 2. Credential and secret safety — PREPARED; ONE OWNER ACTION REMAINS

- Stored provider credentials are encrypted and the health audit exposes no secret values.
- The TikTok refresh token is healthy; its short-lived access token is expired.
- Ferocity now contains a native encrypted token-refresh path so runtime use can recover it without storing plaintext.
- Any Netlify token pasted into a chat must be revoked and replaced before final release. Do not paste the replacement into chat.

## 3. Jobber OAuth — CODE READY; RELEASE CALLBACK REQUIRED

- OAuth start, callback, encrypted token storage, provider-independent bridge, and readiness checks exist.
- Authorization must not be approved before the production callback is deployed.
- After release, approve Jobber once and run the read-only connection test.

## 4. Retell controlled call — PREFLIGHT COMPLETE; CONTROLLED LIVE TEST REQUIRED

- Retell credentials and the Ferocity phone number are present.
- Inbound, outbound, and live actions remain intentionally disabled; compliance is still marked for review.
- Final certification requires one owner-approved safe destination call, followed by verification of webhook receipt, transcript/summary, usage attribution, transfer/escalation behavior, and shutdown controls.

## 5. TikTok connection — RECOVERY IMPLEMENTED; CLIENT CONFIG/DEPLOYMENT REQUIRED

- Access-token expiration is detected instead of silently treated as healthy.
- Refresh logic rotates both encrypted access and refresh tokens.
- The current release environment still needs the TikTok client key and client secret available to the runtime before the connection can perform live actions.

## 6. Tenant invoice payment — STRIPE READY; TEST INVOICE REQUIRED

- The connected Stripe account is fully submitted with charges and payouts enabled.
- The database currently has no unpaid invoice candidate, so no customer payment was fabricated or charged.
- Final certification is: create a clearly labeled low-dollar test invoice, generate its payment link, pay it with an approved card, then verify webhook, invoice balance, ledger, fees, payout destination, and receipt.

## 7. Golden Business Loop — ENGINE READY; LIVE EVIDENCE REQUIRED

- AI command execution passes.
- Fifty-four active AI workflows are healthy with no failed/stuck runs.
- Existing loop runs have reached lead qualification and estimate preparation.
- Final certification must prove one traceable journey through opportunity, communication, estimate, schedule, field proof, invoice/payment, review, and growth reuse. Each external action remains governed by consent and approval policy.

## Product experience confirmed

- The main app already provides an `Ask Ferocity` command surface.
- The app shell keeps a command entry available away from the home screen.
- The homepage and demo now explicitly demonstrate that owners can ask Ferocity a business question or tell it what outcome to handle.
- The in-app command strip says `Ask Ferocity anything. Tell it what to do.` and routes normal-language requests through the existing command engine.
- Attention Command supplies proactive priorities, revenue opportunities, provider gaps, and decisions needing human judgment.
- No additional command center was added; doing so would duplicate working product surfaces.

## Final release order

1. Revoke/replace the exposed Netlify token and stage the replacement privately.
2. Explicitly authorize the frontend production deployment.
3. Deploy once.
4. Approve Jobber OAuth against the live callback.
5. Refresh/reconnect TikTok and verify the connected identity.
6. Run the one controlled Retell call.
7. Run the low-dollar Stripe Connect invoice payment.
8. Complete the Golden Business Loop certification and retain evidence.
9. If any certification fails, disable only that provider lane; do not take down the platform.
