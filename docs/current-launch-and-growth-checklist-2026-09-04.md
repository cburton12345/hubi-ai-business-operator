# Ferocity current launch and growth checklist — 2026-09-04

This is the current working checklist for the remaining work before Ferocity is promoted aggressively. It supplements the immutable production evidence in `production-release-certification-2026-09-04.md`. Completed historical plans do not replace this list.

The canonical cross-product distinction between implemented features, approval-ready work, connection-gated work, and genuinely unattended automation is recorded in `AUTOMATION_READINESS_TRUTH_2026-09-20.md`. A page, setting, adapter, or successful local test does not by itself certify a live autonomous outcome.

## Current truth

- The deployed core is suitable for a controlled customer launch.
- Ferocity is not positioned as contractor-only software. Its operating model must remain equally legible to professional firms, agencies, offices, field-service companies, trades, and other organizations whose work moves through conversations, decisions, delivery, money, and growth.
- Ferocity can plan campaigns, produce marketing drafts, organize approved media, capture and qualify leads, continue approved follow-up, track source-to-revenue activity, and recommend the next move.
- Ferocity must not be described as able to publish or spend everywhere autonomously until the applicable account is connected, approved, funded, and live-certified.
- Monthly Starter, Growth, and Operator plans include 2, 4, and up to 7 organic publishing moments per week respectively. One moment is one original business-grounded idea adapted across appropriate connected profiles; paid distribution, media budget, premium rendering, and third-party fees are separate.
- Ferocity may describe a verified severe-weather opportunity when a relevant National Weather Service alert overlaps a configured service area. It may only say storm-related demand is rising when tenant lead activity independently corroborates that claim.
- Protected actions remain governed by workspace authority rules, approval mode, consent, budgets, provider health, and usage limits.
- Provider readiness is now state-driven without weakening the executable-adapter safety ceiling. Platform admins can record setup, provider review, limited certification, live certification, or suspension independently; live actions remain off until certification, credentials, and an implemented adapter all agree.
- High-risk product controls now also have an execution contract independent of provider status. The release gate fails if a call mode or other required capability lacks a declared control, stored state, runtime executor, limitation, evidence, and honest certification state. This closes the class of defect where a setting saves successfully but its provider/runtime cannot perform what the label implies.
- Customer-owned integration cards now include a tenant-scoped disconnect path that immediately disables Ferocity access, erases stored credential material, pauses routes, blocks queued live actions, and disconnects mailbox sync where applicable. The UI also states honestly that providers without a safe revocation API may still require the customer to remove the remote grant in the provider's authorized-apps page.
- Twilio is not a required dependency for the core platform. Twilio-dependent claims remain unavailable while that account is suspended.
- The live homepage hero body was corrected through the editable public-content system on 2026-09-04. The source fallback is also corrected but is not yet deployed.
- The live homepage and demo currently contain an interactive business-loop presentation, not a produced sales video. There are no public `.mp4`, `.webm`, `.mov`, or `.m4v` assets in the site build as of 2026-09-06.
- The complete local pre-deploy gate passed on 2026-09-11: public/provider/UI guards, 42 workflow integration checks, migration validation, 531 application tests, six Marketplace worker recovery tests, typecheck, lint (warnings only), and the optimized 104-page production build. The read-only runtime/provider readiness pass also passed; Meta still needs its Business Login configuration ID after verification, while Yahoo and Twilio remain optional/gated.
- Re-ran that complete gate after the call-routing/context hardening on 2026-09-11 with the same clean result: 145 test files / 531 tests, six worker tests, typecheck, 0 lint errors, and a 104-page production build. Production/provider readiness also passed (213 migrations, 116 required files, and 14 provider-lane groups).
- Removed the accidental literal `%SystemDrive%` cache tree from the repository by moving its four Windows cache databases to the recoverable sibling quarantine folder `C:\Users\schem\Documents\Codex\2026-05-17\ferocity-cache-quarantine-20260911`.

## P0 — finish before aggressive promotion

- [ ] Complete one real paid subscription lifecycle with an owner-controlled payment method: payment, Stripe webhook, entitlement activation, receipt, customer portal, plan change or renewal, cancellation/refund behavior, failed-payment grace, restriction, and restoration.
  - [x] Reconciled all six public subscription prices against the live Stripe catalog and successfully created then expired a no-payment live checkout session on 2026-09-06.
  - [x] Added regression coverage for the 7-day grace, restriction, suspension, and immediate restoration policy; protected plan changes, the Stripe customer portal, and usage invoice syncing with `billing:manage` authorization at the API boundary.
  - [ ] A real paid owner lifecycle still requires an owner-controlled payment followed by the portal, cancellation/refund, failed-payment, and restoration exercises; automated checks cannot safely manufacture these real financial events.
- [ ] Certify the new Ferocity-managed phone-number lifecycle in production.
  - [x] Added explicit owner provisioning approval, current weighted Retell number APIs, tenant-scoped durable lifecycle jobs, seven-day full-service recovery, 30-day number retention, automatic restoration, scheduled-cancellation continuity, port-out protection, and a final 24-hour release warning.
  - [x] Added owner timeline/push visibility, operator alerts, provider-action gating, focused policy/adapter tests, and a visible port-out protection control without creating a second phone system.
  - [ ] After migration/deploy, follow `managed-phone-number-lifecycle-2026-09-07.md`: enable the provider switch only in a controlled window and certify provisioning, callback, transfer, billing restriction/restoration, port-out, disposable-number release, and two-tenant isolation.
  - [x] Applied migrations 205–209, deployed the reviewed application, required a tenant-specific synchronized transfer destination before provisioning, enabled the lifecycle with Retell/Telnyx inventory, and verified zero eligible purchase candidates and zero provisioning jobs at activation.
  - [ ] Use one controlled eligible tenant to certify the first managed-number purchase and complete the remaining live call, transfer, billing-recovery, port-out, release, and two-tenant exercises.
- [ ] Run a fresh end-to-end Ferocity Connect physical-device certification: outbound, inbound, delivery evidence where Android exposes it, STOP, START, HELP, offline queue/recovery, device revoke, device replacement, and update installation.
  - [x] Corrected inbound validation to accept carrier short codes and international alphanumeric sender IDs; focused Ferocity Connect tests pass (16/16) and TypeScript passes. This source change still requires the final deploy before it affects production.
  - [x] Added workspace-timezone-aware scheduled SMS composition on the existing outbound queue, including send now, tomorrow morning, next business morning, custom time, upcoming-message visibility, edit, and cancel. The existing worker rechecks provider readiness, consent, suppression/STOP state, quiet hours, authorization, and idempotency at execution time. Focused scheduling/queue/Connect tests pass (14/14); production still needs the final deploy and one physical delayed-send certification.
- [ ] Store one encrypted Android signing-key recovery copy outside the current Windows/OneDrive identity.
- [ ] Run the final two-account Field Team physical walkthrough in English and Spanish, including invite/join, role restrictions, scheduling, time, location permission, offline sync, proof capture, money advanced, and cross-tenant denial.
- [ ] Confirm support intake, owner notification, escalation, and issue-status communication with one real production support request.
  - [x] Hardened support creation so the saved case survives an email/push outage, each notification failure is logged, severity reaches the platform-admin queue, and the requester receives a durable reference.
  - [ ] Submit and resolve one production case after the final deploy to certify real email/push/status behavior.
- [x] Reconciled the source copy and runtime rules for Plans, Start Ferocity, Ferocity Earn, voice minutes, SMS/Ferocity Connect, overages, included usage, and failed-payment continuity.
  - [x] Starter explicitly includes the core dashboard and Business Brain; voice is not the lead value proposition; Earn is the first lower-commitment path; managed voice is 25/100/300 included minutes with a shared $0.25 completed-minute overage source.
  - [x] Added migration 205 so persisted prices and Starter/Growth/Operator voice entitlements match the public offer.
- [x] Add included organic publishing without hiding ad spend or flooding customer profiles with AI filler.
  - [x] Added migration 208, explicit per-brand opt-in, 2/4/7 weekly moment entitlements, channel selection, distinct-moment counting across adaptations, and a daily cadence organizer.
  - [x] Extended the existing content-quality review and publishing queue instead of creating duplicate marketing systems.
  - [x] Added deterministic quality checks for missing business sources, unsupported claims, generic AI language, repetition, thin content, and missing approved visuals.
  - [x] Closed the route that allowed an approved draft into an approval or scheduling state before its quality review passed.
  - [x] Updated Plans and Marketing OS copy to distinguish included organic publishing from separately approved paid promotion, ad-platform spend, premium rendering, and provider fees.
  - [ ] After migration/deploy, opt in a controlled brand, approve two real sourced pieces, certify weekly-moment counting across multiple channel adaptations, and verify the connection/approval gate prevents premature external publishing.
- [x] Approve and configure a flagship Ferocity walkthrough/video that demonstrates the business loop and truthfully identifies that Ferocity's marketing features helped create it.
  - [x] Ferocity's real Internal Portfolio now contains an updated Marketing OS profile, six review-only launch outputs, and a 60-second flagship product-proof brief. No renderer, publisher, ad account, or paid spend was invoked.
  - [x] Approved the Christopher Burton founder digital-twin direction and saved a reusable identity sheet plus lakeside continuity test under `artifacts/brand/founder-character/`; future footage should preserve that identity with natural proportions and a warmer, candid expression.
  - [x] Produced a 48-second hybrid flagship cut plus 15-second and 6-second variants, captions, `ferocity.live`, and a truthful Ferocity/AI-footage disclosure without spending on new footage.
  - [x] Owner reviewed and rejected that hybrid direction because it reused generic footage and visually kept the owner working at a computer. Those cuts must not be configured or published.
  - [ ] Produce and approve the replacement founder-led story using the approved Christopher Burton identity direction: freedom/family/lakeside context, one consequential decision, and Ferocity continuing the work without turning the founder into a generic spokesperson.
  - [x] Locked the replacement 45-second voiceover, eight-scene edit map, exact overlays, 30/15/6-second cutdowns, audio direction, disclosure, truth rules, and two founder-consistent storyboard sheets under `artifacts/launch-video/founder-flagship-preproduction/`. No premium video render was purchased.
  - [x] After owner storyboard approval, rendered one four-second founder-motion test and one four-second business-coordination test through Ferocity's tracked, capped video path. Estimated provider cost: $0.80.
  - [x] Rendered the approved 12-second proof-to-growth scene and eight-second founder-decision scene, then assembled the four scenes into a 28-second master with natural founder-style narration, burned-in captions, `ferocity.live`, and the disclosure “Created using Ferocity's marketing features. AI footage rendered through a connected provider.” Estimated tracked premium-video provider cost across all four scenes: $2.80. No publishing or ad spend occurred.
  - [ ] After the next authorized frontend deploy, place and test the final master on the intended public page, verify captions/playback on desktop and mobile, and confirm analytics events. Do not publish to social or activate paid distribution without the owner's separate approval.
  - [ ] Add a real video player, poster, captions/transcript, performance-safe formats, and analytics to the homepage/demo only after the final asset is approved.
- [ ] Certify verified severe-weather opportunity monitoring in production before using it in public sales material.
  - [x] Added migration 207, tenant-isolated weather evidence, relevant NWS alert normalization, conservative service-area matching, internal storm-lead corroboration, and honest claim separation.
  - [x] Added a rate-conscious 15-minute scheduled monitor and background processor. It reuses Marketing OS recommendations, keeps publishing/spend approval-gated, preserves dismissed recommendations, expires stale alerts, and sends no customer PII to the weather provider.
  - [x] Added weather-growth recommendations to the existing in-app notification center, including per-user read/acknowledge/dismiss controls and a direct path to Marketing OS.
  - [x] Added preference-aware, deduplicated app push alerts: one verified-weather opportunity alert, plus one escalation if independent lead activity later supports the stronger “storm-related demand is rising” claim.
  - [x] Removed unsupported “storm demand is rising” language from existing video-source scripts; weather-only examples now say a verified alert overlaps the service area.
  - [x] Focused tests, TypeScript, migration validation, and lint pass locally.
  - [ ] After migration/deploy, configure a controlled weather-sensitive service area and certify a real alert or recorded fixture through storage, recommendation wording, expiry, owner review, and the no-publish/no-spend boundary.
- [x] Upgrade Ask Ferocity from keyword-only routing to AI-assisted command understanding while preserving deterministic platform actions and approval controls.
  - [x] Added business-profile context, recent multi-turn context, natural clarification, semantic capability routing, and short-follow-up understanding. The AI cannot silently elevate an owner request into sending, publishing, spending, charging, or paying.
  - [x] Made Ferocity Chat the permanent customer entry experience: incomplete accounts enter its one-question-at-a-time onboarding mode, completed customer accounts land in the same operational conversation, the Ferocity brand returns there, and the former Setup Coach entry now opens Business setup inside that chat. Today and the full Command Center remain optional detail views rather than competing home screens.
  - [ ] After the final deploy, certify ten real owner conversations covering vague goals, short follow-ups, read-only questions, draft preparation, internal changes, consequential-action approvals, and safe provider/usage failure behavior.
- [x] Run the complete predeploy gate immediately before the final frontend deploy.
  - [x] On 2026-09-06: public guard, provider truth, UI guard, 42 workflow integration checks, migration validation, 493 application tests, 6 worker tests, TypeScript, lint, and the 101-page production build passed. The canonical gate now includes tests and pending-migration validation so those checks cannot be skipped accidentally.
  - [x] Reran the canonical gate on 2026-09-06 after the Ask Ferocity, connector-certification, Earn-first pricing, and public-site edits: guards passed, 42 workflow checks passed, migrations 205–206 validated without persistence, 497 tests passed, 6 worker tests passed, TypeScript and lint passed, and all 101 static pages built.
  - [x] Reran the canonical gate after weather-demand intelligence and the corrected public walkthrough story: all guards passed, 42 workflow checks passed, migrations 205–207 validated without persistence, 502 tests passed, 6 worker tests passed, TypeScript and lint passed, and all 101 static pages built.
  - [x] Reran the canonical gate after the organic-publishing cadence, anti-slop quality gate, plan copy, and founder-video preproduction package: all guards passed, 42 workflow checks passed, migrations 205–208 validated without persistence, 506 tests passed, 6 worker tests passed, TypeScript and lint passed, and all 101 static pages built.
  - [x] Reran the canonical gate after the managed-number lifecycle: all guards passed, 42 workflow checks passed, migrations 205–209 validated without persistence, 517 application tests passed, 6 Marketplace worker tests passed, TypeScript and lint passed, and all 101 static pages built.
- [x] Performed the reviewed production deploy after explicit owner approval on 2026-09-07.
- [x] Ran production smoke, mobile/desktop navigation review, live Stripe catalog and create/expire checkout, auth protection, health, robots/sitemap/canonicals, and provider readiness checks. The previous successful deploy remained available throughout the one failed intermediate build attempt, and the corrected deploy completed successfully.

## P1 — external approvals and channel certification

- [ ] Finish Meta business verification and customer-access/app review, then certify isolated-tenant Facebook connection, approved send, inbound capture, offline recovery, and revocation.
  - [x] Built a deployment-independent Marketplace worker with a local Windows supervisor, demand-started persistent Chrome, scheduled inbound sweeps, idle shutdown, encrypted local credentials, bounded restart recovery, and an uncertain-send journal. Backend pending-work wake route and worker health metadata are implemented locally; no frontend deployment was performed.
  - [x] Extended the local worker and existing Growth system for opt-in, capped Facebook Groups discovery; sourced rule snapshots; a 30-day rule-freshness claim gate; approval-first group-post actions; dedicated group-composer execution; and browser outcome evidence. Fresh installs keep group discovery and all sending off. Worker package `0.2.0` is prepared locally; no deployment or live group action was performed.
  - [x] Added business/service/location-based Facebook group discovery with a limited adjacent-community lane, approval-first join requests, owner-only membership answers, per-group and account-wide cadence gates, and duplicate-content blocking. Worker package `0.3.0` is prepared locally; no deployment, join, or live post was performed.
  - [ ] After the next deploy, certify one controlled test group: correct discovery, exact rules/source, stale-rule blocking, approval visibility, one post, outcome evidence, removal/warning handling, and immediate pause/revocation before allowing broader group use.
  - [ ] After the next deploy, pair a controlled Facebook identity and physically certify Windows login auto-start, inbound sweep, one approved send, idle shutdown, Chrome crash recovery, worker crash recovery, checkpoint pause, revocation, and no duplicate after an interrupted send.
  - [x] Meta app `Ferocity` is attached to the `Ferocity Operations` business portfolio.
  - [x] App domain, website, privacy policy, terms, data-deletion URL, category, 1024×1024 Ferocity icon, and `ferocityflow@outlook.com` contact email are saved.
  - [x] Meta reports no current required actions for the app.
  - [x] Submitted Preferred LLC business verification to Meta on September 11, 2026 using the matched business record and principal identity. Meta confirmed `Identity confirmation in progress` and said review usually completes within 48 hours.
  - [ ] After business verification, complete Meta Tech Provider access verification and request only the permissions Ferocity actually uses.
- [x] Reauthorize TikTok, then certify the actual customer OAuth flow before advertising it as connected.
  - [x] Confirmed the developer owner is `ferocityflow@outlook.com` and the production app is `Ferocity` (`7668364411148732437`).
  - [x] TikTok shows the app as live in production since August 4, 2026 with Login Kit and `user.info.basic` approved.
  - [x] Confirmed the production callback is `https://ferocity.live/api/integrations/tiktok/oauth/callback` and the live Ferocity OAuth start route reaches TikTok authorization.
  - [x] Restored the previously empty `TIKTOK_CLIENT_SECRET` in the Netlify production context without exposing it.
  - [x] TikTok OAuth unit tests pass (5/5).
  - [x] Completed fresh production authorization for the isolated `ferocity-qa-demo` workspace through the original Google-backed TikTok identity. TikTok's consent screen showed `ferocity78` before authorization, the live Ferocity callback completed with `setup=connected`, and the production readiness check verified `displayName: ferocity78`, encrypted token storage, and `identityVerified: true`.
  - [ ] Content publishing and ad control are not part of the current approval or adapter. Those require a separate implemented product/scope, demonstration, TikTok revision/review, and controlled live certification before any such claim is made.
- [x] Microsoft advertiser identity verification for Ferocity / Preferred LLC is approved. Microsoft Advertising's live Verification Hub showed **Verified advertiser** on September 12, 2026.
  - [x] Rechecked the live Verification Hub and confirmed the approval directly; no additional identity-verification action is pending.
- [ ] Resolve or formally close the Twilio suspension. Keep all Twilio-specific functionality gated until the account and applicable messaging registrations are approved.
- [ ] Finish Vonage SMS production certification. The account is owner-reported unblocked and the Messages API adapter, signed webhook verification, Message Health normalization, safety routing, and plan allowance logic are implemented locally. Still required: credentials, funded sender number, applicable US registration, migration 219, deployed webhook, and controlled outbound/inbound/delivery/STOP/HELP certification. Telnyx, SignalWire, Sinch, and other applications remain optional capacity/failover paths; do not represent an application or trial account as production approval.
- [ ] Configure and verify each tenant's call-transfer destination before enabling Retell transfer for that tenant.
  - [x] Confirmed the provider-independent call-management controls already support AI-first, owner-first, simultaneous ring, important-only, caller-requested-human, schedule-based, presence-based, custom priority/value thresholds, temporary attention states, and per-contact no-AI preferences. These settings are stored per workspace and can change without a code deployment.
  - [x] Hardened the Retell runtime so verified business/contact context, call purpose, authorized next steps, and the active call-routing instruction are injected into each call with safe defaults. The UI now explains that Retell-managed numbers reach AI first; true owner-first or simultaneous ringing requires a connected carrier capable of multi-leg routing.
  - [x] Provisioned exactly one managed number for the isolated QA tenant; verified dedicated inbound/outbound agent binding, tenant transfer tool, dynamic inbound webhook, event webhook, ten-minute cap, 60-second silence ending, and outbound-disabled database state.
  - [x] Completed two authorized outbound calls (29 and 43 seconds) with Retell-side transcript, summary, and natural agent hang-up evidence.
  - [ ] Finish the QA workspace's designated Retell Webhook API Key setup. The live calls proved the current API credential is not the signing key; Ferocity correctly rejected those signatures and therefore did not persist completion/transcript/usage events.
  - [x] Extended source configuration to resolve a separate encrypted `retell_webhook_api_key` per tenant, falling back to the API key only for single-key accounts. Focused voice/lifecycle tests pass (36/36) and TypeScript passes; this source fix awaits the next authorized deploy.
  - [x] Called the QA number from the verified phone and certified the callback route from a real 51-second inbound call. Retell recorded a transcript and summary, the correct tenant fallback agent was bound, and the number is now callback-certified.
  - [ ] Verify a live tenant transfer and ordinary outbound activation without routing any tenant call to the Ferocity platform owner.
- [ ] Certify two simultaneous real-tenant Retell routes with consenting testers and verify tenant isolation, transfers, callback handling, transcript routing, and concurrency controls.
- [ ] Complete customer-ready OAuth/live certification for priority call-log bridges: Jobber, GoHighLevel, and Housecall Pro. Keep them labeled unavailable or setup-required until then.

## P1 — make Ferocity market Ferocity

- [x] Create Ferocity's own production Marketing OS profile: audience, service categories, positioning, brand voice, proof, offers, approved claims, prohibited claims, service area, and conversion goals.
  - [x] Prepared idempotently in the Internal Portfolio with package key `ferocity-flagship-proof-2026-09`; factual proof and final claims still require owner review before publishing.
- [x] Select the first launch offer and path: Ferocity Earn for low-commitment entry, subscription plans for full operating-system adoption, and the Business Grader as the primary lead magnet.
  - [x] Pricing source and migration 206 now lead with Ferocity Earn, put monthly plans second, and keep managed voice as a supporting allowance rather than the headline offer.
  - [x] Added tenant-specific Earn pilot sponsorship without changing the standard Earn economics. Normal Earn keeps provider costs separate; only a named workspace with a written active sponsorship receives a capped Ferocity-funded provider budget, and that exception pauses for review instead of becoming a surprise customer charge.
  - [ ] Recruit one genuinely interested controlled Earn pilot, document the business baseline and desired outcome, approve that workspace's sponsorship and exact cap, obtain explicit enrollment/authority/consent, and run the first 30 days with weekly revenue, provider-cost, support-load, and contribution-margin review. Do not widen sponsorship automatically to other Earn customers.
- [ ] Connect only the marketing destinations that are genuinely approved and ready; leave unavailable providers visibly gated.
- [ ] Load approved brand assets, product screenshots, proof, demo clips, FAQs, objections, and customer-safe claims into Ferocity's media and Business Brain records.
- [x] Have Ferocity generate the first 30-day campaign as drafts: landing-page angle, short video concepts, organic posts, email follow-up, retargeting concepts, founder outreach, and lead-nurture sequences.
  - [x] The review-only package now contains nine channel outputs, a seven-scene 60-second production brief, and twelve draft calendar items spanning the first 30 days. Live publishing, paid rendering, and ad spend remain disabled pending final offer, asset, channel, and owner approval.
- [ ] Review and approve the campaign, set explicit channel budgets and daily loss limits, and enable publishing or sending only where consent and provider readiness are proven.
  - [x] Confirmed TikTok Login Kit is live for app `7668364411148732437`, limited to login/basic profile authorization. Ferocity must not represent TikTok posting or ad execution as live under this approval.
  - [ ] Finish the existing TikTok for Business account login, agreement/billing, publishing/ads scopes, and controlled certification before enabling posting or spend. Linking `ferocity78` reached TikTok's broad permission grant, but its required email step reported that `ferocityflow@outlook.com` is already attached to another TikTok for Business account. The duplicate path was cancelled; recover the existing account rather than fragmenting Ferocity into a second advertiser identity.
- [ ] Verify attribution from visit to grader/start request to checkout to paid customer, including campaign/source metadata and owner alerts.
- [ ] Start with a small live cohort, inspect replies and conversion quality daily, then increase spend and automation only when support load, delivery health, and unit economics remain healthy.
- [ ] Use Ferocity's Daily Brief and owner command surface to report spend, leads, qualified opportunities, follow-up, booked work, subscription revenue, failures, and recommended next actions.

## P2 — growth after the first customers

- [ ] Capture real testimonials, objections, setup time, time-to-value, and outcomes with explicit customer permission.
- [ ] Turn verified customer outcomes into case studies, proof clips, comparison pages, review content, and revised campaigns.
- [ ] Establish weekly funnel review: traffic, grader completion, setup requests, checkout starts, paid conversion, activation, retention, support load, refunds, AI/provider cost, and contribution margin.
- [ ] Add capacity thresholds and owner alerts for database, Netlify, AI usage, Retell concurrency, email, connector devices, support backlog, and payment failures.
- [ ] Expand provider and publishing coverage only in response to customer demand and measurable acquisition value.

## Launch decision rule

Begin controlled outreach now. Do not wait for every optional integration. Do not begin large paid campaigns or claim full autonomous multichannel operation until the P0 financial, device, support, pricing, video, and final-deploy checks are complete. Scale promotion in steps as the measured system proves it can acquire, activate, support, and retain customers without losing money.
# Customer email integration (2026-09-09)

- [x] Add separate customer-owned Gmail and Microsoft 365 mailbox OAuth connections.
- [x] Request read-only mailbox scopes; do not imply permission to send.
- [x] Encrypt and refresh mailbox OAuth credentials using the existing credential vault.
- [x] Normalize recent inbox messages into tenant-isolated storage with RLS.
- [x] Classify leads, customer needs, billing, support, and urgent messages.
- [x] Add a bounded, idempotent manual inbox sync with health/error history.
- [x] Add a 15-minute unattended sync with bounded concurrency and per-mailbox failure isolation.
- [x] Add Email Watch UI and navigation.
- [x] Add provider-independent adapters and unit coverage.
- [x] Apply migration `210_customer_mailbox_integrations.sql` to production.
- [ ] Add the new read-only Gmail scope to the Google OAuth consent screen and complete any Google verification required for external users.
- [ ] Add delegated `Mail.Read` to the Microsoft app registration and grant/verify tenant consent.
- [ ] Certify one real Gmail connection and one real Microsoft 365 connection after the next deployment.
- [ ] Design sending as a separate opt-in: explicit send scope, sender identity, audit log, approval/autopilot controls, unsubscribe/consent rules, rate limits, and inbound thread mapping.

# Receipt & expense intelligence (2026-09-10)

- [x] Build one reusable document-intelligence engine for Ferocity, H4R, and future products rather than product-specific OCR pipelines.
- [x] Accept camera capture, upload, drag/drop, and batches of up to 25 images or PDFs; process each file independently.
- [x] Treat 25 as a file-batch limit rather than a page/charge limit. Preserve one multi-page digital statement as one source while extracting up to 500 separate debit/credit transactions in page order.
- [x] Read scanned/image-only and mixed PDFs by rendering low-text pages privately for vision extraction, in ordered groups of at most five pages and with a 25-page per-file safety ceiling. Clone PDF buffers between extraction/rendering so transferred buffers cannot break mixed-document processing, and never persist private image/data URLs in AI audit metadata.
- [x] Never post a statement total as one expense. Present debits for batch review, exclude credits/transfers/likely duplicates by default, and post only deliberately selected charges as separate idempotent Money expenses linked to the original statement.
- [x] Harden statement normalization against banks that export debits as negative numbers, conservatively recognize account/card payments when direction metadata is missing, preserve repeated legitimate same-day charges, and require merchant evidence before treating an existing same-date/same-amount expense as a likely duplicate.
- [x] Preserve every original in the existing private receipt bucket and store normalized fields, line items, confidence, review reasons, audit events, and duplicate evidence.
- [x] Match expenses against live Ferocity jobs, customers, workers, crews, assets, or overhead; require review when confidence is low and keep automatic posting off by default.
- [x] Post approved documents into the existing `operations_expenses` ledger so job profitability, Money, reports, and the existing expense/tax accounting CSV all use one source of truth.
- [x] Add natural-language receipt search and secure original-document retrieval.
- [x] Extend the existing signed Resend inbound webhook so every eligible workspace can forward attachments to `receipts+{workspace-slug}@ferocity.live` without creating a second email system.
- [x] Add a deployment-independent H4R adapter for property, unit, lease, maintenance, CapEx, utilities, taxes, insurance, supplies, and rental-overhead targets.
- [x] Apply migrations 211–212 to production, provision active aliases for all 6 eligible workspaces, store the production document-ingest secret, and pass the read-only schema/RLS/private-storage/alias readiness check.
- [x] Applied migration 213 before deployment and reran `npm run receipt-intelligence:readiness`; schema, RLS, private storage, aliases, and all three migrations are green.
- [x] Pass the complete local release gate after the statement upgrade: public/provider/UI/workflow guards, zero pending migrations, 528 application tests, 6 Marketplace worker tests, TypeScript, lint, and a 104-page production build.
- [x] Reran the complete gate after scanned/mixed-PDF OCR and native-runtime packaging: 528 application tests and 6 worker tests passed, TypeScript and lint completed without errors, all guards remained green, and all 104 pages built on Next 16.3.4. Production dependency audit reports zero vulnerabilities; the remaining npm audit findings are development-only transitive packages.
- [ ] After the next authorized deploy, certify one photographed receipt, one multi-file batch with a partial failure, one emailed attachment, one multi-page digital bank/card statement, one fully scanned statement, one mixed text/scanned statement, the over-25-page review warning, transfer/credit exclusion, duplicate warning/review, approval into Money/job costing, natural-language retrieval, and tenant isolation. Do not deploy solely to run this certification without owner approval.

# Selective frontier AI routing (2026-09-11)

- [x] Preserve the economy/balanced/advanced model lanes instead of moving every Ferocity request to an expensive frontier model.
- [x] Add GPT-6 Astra compatibility: omit unsupported temperature controls, start at low reasoning effort, allow a longer bounded timeout, and account for its current input/cached/output pricing.
- [x] Escalate only infrequent high-value work: ambiguous or multi-target expense allocation, growth-funnel strategy, adapter design, and premium video creative direction. Routine OCR, ordinary chat, deterministic actions, and clear expense matches remain on the normal lane.
- [x] Verify the configured OpenAI account can access `gpt-6-astra` and certify the exact Chat Completions JSON request shape with a live 200 response.
- [x] Update the current GPT-5.6 Luna/Terra/Sol accounting rates from official OpenAI documentation so Ferocity's AI budget guard does not use stale estimates.
- [ ] Activate `AI_MODEL_ADVANCED=gpt-6-astra` in the production runtime with the next authorized deployment, then compare quality, latency, fallback rate, and cost on representative advanced jobs before expanding its scope.

# Ferocity conversational workspace and UI finishing pass (2026-09-17)

- [x] Make Ask Ferocity the default customer entry surface while preserving the full Command Center for users who prefer dashboards.
- [x] Add tenant-isolated, durable, named Ferocity conversations with recent-thread switching and a one-click new conversation.
- [x] Bring the existing Receipt & Expense Intelligence importer into chat for private image/PDF and batch document intake; preserve the existing review, duplicate, allocation, and posting controls.
- [x] Replace vague chat output with human statuses and structured sections for completed work, imported files, blockers, decisions, and the next workspace action.
- [x] Put pending approvals directly into the conversation with approve, reject, change-request, and optional-note controls backed by the existing approval system.
- [x] Add an in-chat first-session path that shows business basics, connections, and authority/goals without presenting a wall of settings.
- [x] Add a collapsible recent activity feed backed by the existing operator timeline and capability reliability audit.
- [x] Reduce customer navigation from `All Tools` to `More`, keep Ask Ferocity first, and provide a narrower role-aware field/member view.
- [x] Improve phone usability with a sticky composer, attachment control, responsive conversation history, full-width approval actions, and compact activity rows.
- [x] Validate migration 218 without persistence, pass targeted ESLint, TypeScript, all 547 application tests, and the 107-page optimized production build. The existing `unpdf` dynamic-dependency warning remains non-blocking and the build completed successfully.
- [ ] On the next explicitly authorized deploy, apply migration 218 before releasing the frontend.
- [ ] After that deploy, certify: create/switch/resume a chat; send a clarification; attach one receipt and one multi-file batch; approve/request changes/reject from chat; verify role-specific navigation; verify phone layout; confirm activity appears; confirm tenant isolation and RLS.
