# Ferocity final predeploy and postdeploy certification

**Status:** Predeploy work complete. **No frontend or application deployment was performed.**

This document is the authoritative handoff for the next production release. Older checklists remain useful history, but this file records the current gate and the tests that must happen immediately after the user authorizes deployment.

## Completed before deploy

- [x] Updated the Ferocity Retell support agent to open naturally: “Thanks for calling Ferocity. What can I help you get done today?”
- [x] Removed the unnecessary opening “AI assistant” label while preserving truthful disclosure when a caller asks.
- [x] Kept human-help behavior honest: the agent records and routes a callback request; it does not promise a live transfer until a tenant transfer destination exists.
- [x] Tightened Features, Pricing, and Start messaging without redesigning the pages.
- [x] Made managed voice allowances and overage pricing visible on Pricing.
- [x] Kept Start progressive: workspace creation first, optional setup details later.
- [x] Added provider-funding and isolated-automation-failure alerts to the platform-owner alert path.
- [x] Added a deduplicated platform-owner daily operations brief.
- [x] Confirmed all seven live Stripe subscription prices are readable by the readiness gate.
- [x] Created two encrypted Ferocity Connect Android signing backups for the current Windows owner account.
- [x] Added an authenticated, entitlement-gated Ferocity Connect APK download route backed by private release storage.
- [x] Added subscriber download/setup entry points on the public Connect page and inside the workspace.
- [x] Added current-release metadata and an update warning when a paired Android phone is running a different Connect version.
- [x] Confirmed the main Ferocity mobile app is the installable web app; it uses the same application code and receives normal web releases rather than requiring a separate native-app rebuild.
- [x] Reframed employee access as a reusable Field Team work mode, added a sign-in choice, fixed field-mode post-login routing, and added one-tap switching for authorized owners/managers/operators.
- [x] Ran the full unit/integration suite: **126 test files, 464 tests passed**.
- [x] Ran TypeScript, lint, public-claims, provider-truth, RLS, and local predeploy gates successfully.
- [x] Verified **201 database migrations**, **14 provider capability groups**, **42 integrated workflows**, and **98 built routes/pages**.
- [x] Visually checked `/features`, `/pricing`, and `/start` locally on desktop and mobile; no horizontal overflow and no browser warnings/errors were found.

## Deployment hold

- [ ] Deploy only after the user explicitly authorizes the frontend/application deployment.
- [ ] Do not silently add unfinished or approval-blocked providers to public claims.
- [ ] Do not enable Retell outbound calling or live transfer without a verified destination and tenant-safe routing.

## Required immediately after deployment

Run these in order and record the result, timestamp, workspace, provider event ID, and any corrective action.

1. **Public-site production smoke**
   - Check desktop and mobile rendering for Home, Features, Pricing, Start, Ferocity Connect, Plans, Terms, Privacy, SMS Terms, SMS Opt-in, Support, robots.txt, and sitemap.xml.
   - Test every primary CTA and ensure pricing, included usage, overages, and Ferocity Earn agree everywhere.
   - Confirm canonical URLs use `https://ferocity.live`, public marketing pages are indexable, and authenticated/API routes remain protected.

2. **Stripe money-path certification**
   - Complete one real low-risk subscription checkout from the public flow.
   - Verify workspace entitlement, receipt, webhook processing, renewal state, customer portal, plan change, cancellation, refund, and failed-payment/grace-period behavior.
   - Confirm platform-owner alerts fire for a new paid subscriber and a failed recurring payment without exposing payment data.

3. **Retell inbound and callback certification**
   - Call the production number and confirm the new greeting, natural conversation, hang-up handling, transcript, summary, cost record, and support record.
   - Call the displayed number back and verify the caller receives a useful routed experience rather than silence.
   - Ask for a person. Confirm Ferocity records a callback request and does not falsely claim a transfer occurred.
   - Test tenant routing with at least two workspaces before enabling broad customer traffic.

4. **Retell transfer and outbound-capacity safety**
   - Enable live transfer only after the destination is configured and verified per tenant.
   - Verify queued outbound calls respect the configured concurrency ceiling, show a reasonable estimated start time when queued, and recover cleanly from provider throttling.
   - Confirm one tenant’s failure cannot block unrelated tenants.

5. **Ferocity Connect customer-style certification**
   - Apply migration 202, upload the verified signed APK as a draft, and publish it only after its recorded SHA-256 and signing certificate match the release evidence.
   - Confirm anonymous users cannot download the APK and an eligible signed-in workspace receives only a short-lived private download URL.
   - Pair a fresh Android device from a normal customer workspace.
   - Test outbound send, inbound reply, STOP, START, HELP, quiet hours, consent evidence, rate limits, retry/recovery, offline behavior, device replacement, and update installation.
   - Confirm message health and conversation timelines distinguish queued, sent, delivered/unknown, failed, rejected, and inbound messages truthfully.

6. **Email and message-health delivery receipts**
   - After the deployed webhook handler is live, enable the supported Resend delivery events and send a production test.
   - Verify delivery events, provider error codes, retry controls, and owner alerts are recorded without duplicate notifications.

7. **OAuth and provider-state certification**
   - Exercise supported Google and Microsoft customer connect/disconnect/reconnect flows from a clean account.
   - Confirm tokens are tenant-scoped and encrypted, callbacks return to the correct workspace, revoked access degrades gracefully, and UI states remain truthful.
   - Complete Microsoft advertiser identity verification separately; it is an external account checkpoint, not a code deploy gate.

8. **Admin operations certification**
   - Trigger and verify support, payment, provider-funding, capacity, automation-failure, and provider-request alerts.
   - Verify the daily brief is deduplicated and useful on desktop and mobile.
   - Confirm resolved issues stop generating repeated alerts.

9. **Field Team access and workday certification**
   - Confirm “Manage the business” signs in to `/app` and “Field team” signs in to `/employee` using the same account.
   - Verify owners/admins/operators can switch between authorized views, while field-only/viewer users are not offered the full workspace.
   - Link an owner and an employee to separate worker profiles; verify each sees only the correct assignments and can record hours, location, work performed, mileage, costs, proof, and cash-advance responses.
   - Verify English/Spanish selection, offline recovery, invitation approval, and cross-tenant/cross-worker access denial.

10. **Capacity and failure isolation**
   - Observe serverless/function, database, queue, Retell-concurrency, email, SMS, and AI usage during smoke traffic.
   - Confirm upgrade thresholds and owner alerts occur before service exhaustion.
   - Inject one controlled provider failure and verify the rest of the platform remains available.

11. **Search and analytics production verification**
    - Confirm Search Console and Bing can fetch the sitemap and public pages.
    - Verify Googlebot/Bingbot are not blocked at hosting/CDN/firewall level.
    - Confirm privacy-conscious visit, signup, paid conversion, and support analytics appear in the intended dashboards.

## Remaining owner-only recovery item

- [ ] Store one Android signing-key recovery copy outside the current Windows/OneDrive identity (for example, an encrypted offline drive or a reputable password-manager file vault). The two current backups are encrypted, but both ultimately depend on the same Windows account and therefore are not fully independent disaster recovery.

## Honest external-service backlog

These items do not block the core release as long as the product continues to label their status accurately:

- Twilio account suspension and any Twilio ISV/A2P approvals.
- Telnyx, SignalWire, Vonage, Sinch, or other managed-carrier approval/funding work.
- Meta/TikTok and advertising-platform production approvals.
- Jobber write access and deeper GoHighLevel, Housecall Pro, QuickBooks, CMS, or other provider bridges that are not yet certified live.

Ferocity Connect and supported bring-your-own providers may remain available according to their verified capability states; the public product must not imply that an approval-blocked managed provider is already live.
