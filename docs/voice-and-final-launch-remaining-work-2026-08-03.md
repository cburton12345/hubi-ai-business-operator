# Ferocity voice and final launch work

Updated: 2026-08-04

Frontend production deployment remains locked until the owner explicitly authorizes it.

## August 4 integration, SEO, and operator-alert findings

These findings are now part of the release scope. They replace the incorrect assumption that a provider registry entry, credential field, or OAuth foundation is equivalent to a customer-ready integration.

### Definition of a complete customer integration

No provider may be described as connected, available, or supported for live work unless the advertised capability has all applicable items below:

- [ ] A plain-language customer connection path.
- [ ] A real provider adapter rather than a registry-only or planned implementation.
- [ ] Ferocity-owned OAuth application credentials, or an encrypted BYO credential flow when the provider does not offer customer OAuth.
- [ ] Account, property, website, calendar, location, phone number, or advertiser selection as applicable.
- [ ] Connection and identity verification.
- [ ] Tested production reads for every advertised read capability.
- [ ] Tested production writes for every advertised write capability.
- [ ] Webhook, incremental sync, or bounded scheduled synchronization where applicable.
- [ ] Tenant isolation, scoped permissions, token refresh/rotation, revocation, audit history, and credential-health checks.
- [ ] Failure alerts, reconnection guidance, idempotency, safe retries, and an emergency pause.
- [ ] A useful native/export/manual fallback when the external provider is unavailable.
- [ ] Accurate UI states: `Available`, `Connect your account`, `Approval pending`, `Limited`, or `Coming soon`.

An integration is not complete merely because the customer can paste a key. The key can only activate a tested adapter that understands the provider and its authentication, data model, webhooks, limits, and failure modes.

### Standard customer connection methods

- **OAuth:** The customer clicks `Connect Google`, `Connect Microsoft`, `Connect Jobber`, or the equivalent, signs in on the provider's domain, approves requested scopes, selects the relevant account/property, and returns to Ferocity. Ferocity receives a revocable token and never receives the customer's password.
- **BYO API key:** The customer pastes a provider-issued key into the encrypted credential vault. Ferocity masks it, tests it immediately, reports the connected identity and capabilities, and provides disconnect/rotation controls.
- **Telecom/manual setup:** Ferocity guides call forwarding, number selection, SIP, or another provider-specific path without exposing unnecessary telecom terminology.
- **No native connector:** Ferocity must explicitly offer an export, webhook, Zapier/Make, or provider-request fallback. It must not present a placeholder as connected.

Customers should not create developer accounts for normal OAuth integrations. Ferocity owns the provider developer application. A customer-owned developer/API account is appropriate only for a provider that requires BYO keys or for an advanced customer who deliberately selects that path.

### Provider-request workflow and Ferocity operator notification

Already implemented:

- `/app/integrations` contains `Advanced: request another provider` and the `Ask Ferocity to enable it` action.
- Requests record provider, category, intended use, whether the customer already pays for it, official OpenAPI URL when supplied, status, and repeat demand.
- Requests enter a guarded, data-only adapter factory. Generated artifacts cannot execute arbitrary code or deploy to production.
- Customers can see request/build status and receive a workspace push notification after a reviewed adapter is released.

Added locally on 2026-08-04; deployment pending:

- [x] Send an immediate Ferocity operator email to `FEROCITY_NOTIFY_EMAIL` when a customer requests a provider.
- [x] Include provider, category, use case, workspace, supplied specification, and whether the customer already uses the provider.
- [x] Confirm `FEROCITY_NOTIFY_EMAIL` is already `ferocityflow@outlook.com` on the linked `ferocity.live` Netlify project.
- [x] Pass the focused guarded-adapter test suite after the notification change.
- [ ] Deploy this server-action change only with the final owner-authorized release.

Platform-administrator alerts still required:

- [ ] Immediate: checkout/payment failure, security or abuse signal, provider outage affecting customers, failed live automation, low managed-provider balance, urgent support/customer-risk event, and new provider request.
- [ ] Daily operator brief: new subscriptions, cancellations, failed onboarding, provider consumption/cost trends, unresolved customer issues, adapter demand, and provider health.
- [ ] Dashboard-only: normal background activity that should remain visible without creating alert fatigue.
- [ ] Route alerts through one severity/deduplication system so email, push, Attention Command, and Daily Brief do not create duplicate noise.
- [ ] Add SMS operator alerts only after a reliable transactional SMS provider is active. Retell voice does not provide a general SMS lane, and suspended Twilio cannot be treated as available.

### Outbound message health and recovery

This extends the existing provider-independent messaging engine. It must not create a second message store, provider registry, settings area, consent system, or routing engine.

#### Foundations already present

- [x] Every outbound send is stored in `messages` with tenant, conversation, channel, provider, provider reference, status, idempotency key, cost, and timestamps.
- [x] `message_delivery_events` and authenticated/idempotent `message_webhook_events` already preserve delivery history and provider callbacks.
- [x] The provider interface already supports delivery webhooks and message-status lookup without coupling business logic to Twilio or another vendor.
- [x] Twilio delivery callbacks already update message status and record the provider status, error code, and safe error message.
- [x] Provider failures, tenant-level limits, per-recipient limits, consent/opt-out enforcement, emergency pause, audit data, and manual-device SMS fallback already exist.

#### Missing work to complete the Message Health layer

- [x] Define one normalized provider-independent delivery state model covering accepted, queued, sending, sent, delivered, failed, rejected, undelivered, suspected filtered, and unknown outcomes without losing the provider's raw status.
- [x] Store normalized status, raw provider status, provider error code, safe reason, receipt time, final/non-final state, and provider metadata for every delivery receipt; make receipt ingestion idempotent and safe when events arrive out of order.
- [ ] Extend every certified messaging adapter through the same receipt-normalization contract. Twilio and Resend normalization are implemented. Resend's production webhook still subscribes only to `email.received`; expand that existing subscription to sent, delivered, delayed, bounced, failed, and suppressed immediately after the new handler is deployed, then live-certify it. Do not send those events to the old deployed handler before deployment.
- [x] Treat `suspected filtered` as an evidence-based warning, not proof: derive it only from provider signals, known filtering codes, or an expired delivery window, and show the evidence used. Twilio filtering currently requires an explicit provider error code such as 30007/30038/30039; Ferocity does not infer filtering merely because delivery is slow.
- [x] Show message health on each outbound item in the existing conversation timeline, including the latest state, provider, timestamp, safe explanation, and prior delivery events. Completed locally on 2026-08-05: the shared inbox now expands into the 20 most recent messages, shows inbound/outbound direction, provider, normalized state, last provider update, safe reason/code, and the five latest delivery receipts, and links unhealthy items to the existing recovery controls. A read-only database check passed against current tenant data. Migration 181 adds tenant-scoped conversation and receipt-history indexes but remains unapplied until the owner-authorized release.
- [x] Surface failed, rejected, undelivered, and suspected-filtered messages in the existing Attention Command/operator alert system with severity, deduplication, and a direct recovery action.
- [x] Add one-click retry that creates a new explicit idempotency key, links the new attempt to the original message, preserves conversation history, and never mutates the failed attempt into a false success.
- [x] Add retry through another currently configured and eligible provider. Consent, opt-out, approval, capability, account-health, tenant-limit, and cost controls are re-run before sending. Stored BYO credentials alone cannot authorize a send: the tenant lane must be active, outbound-enabled, live-enabled, and unpaused.
- [x] Keep `Send from my device` as an immediate recovery option using the existing manual SMS handoff; do not imply delivery tracking after the user leaves Ferocity unless the device/provider reports it.
- [x] Prevent automatic retry storms with bounded attempts, backoff, terminal-error classification, recipient/provider circuit breakers, and an emergency stop. Recovery is owner-triggered and limited to three linked retries; there is no uncontrolled automatic retry loop.
- [ ] Add provider-contract tests, webhook replay/out-of-order tests, cross-provider retry tests, tenant-isolation tests, timeline UI tests, and a live certification checklist for each enabled provider. Local progress on 2026-08-05: normalization/out-of-order tests, certified-adapter contract tests, conversation-health presentation tests, and explicit cross-provider retry/cap/sensitive-message tests pass. `docs/message-health-live-certification.md` now defines common, Twilio, Resend, manual-fallback, isolation, cost, and evidence checks. Database tenant-isolation, rendered authenticated timeline interaction, webhook replay against the deployed handler, and live provider certification remain release gates.
- [ ] Reconcile public wording after certification: Ferocity can detect and help recover from reported or suspected delivery problems, but must never promise that every carrier/device will deliver or display every message.

### TikTok production advertising truth

- The existing Ferocity TikTok connector uses TikTok Login Kit/Open API for identity/basic-profile authorization.
- Login Kit approval is not TikTok Marketing API production approval.
- Campaign management, advertiser discovery, creative upload, reporting, publishing, and spend require a separate TikTok API for Business developer app, permissions, advertiser authorization, and controlled production certification.
- [ ] Keep existing Login Kit credentials and behavior unchanged.
- [ ] Use the existing TikTok for Business account to create or correct the API for Business developer application.
- [ ] Request only the Marketing API products/scopes Ferocity will actually use.
- [ ] Configure a separate callback and separate encrypted Business API credentials; do not overwrite Login Kit credentials.
- [ ] After approval, authorize a Ferocity advertiser account, certify read-only advertiser/reporting access, then certify guarded writes with budgets, approval controls, usage attribution, and emergency shutdown.
- [ ] Do not build the full Business API adapter before approval or usable sandbox credentials make customer authorization testable. Track the external approval without wasting engineering work.
- [ ] Label TikTok advertising `Approval pending`; do not call it production-connected.

### Ferocity's own search visibility

Verified on 2026-08-04:

- `https://ferocity.live/`, `/robots.txt`, and `/sitemap.xml` return HTTP 200.
- Public pages are crawlable and the sitemap is reachable.
- Independent branded/category searches did not surface `ferocity.live`; the site does not yet own `Ferocity AI`, category, or exact-domain discovery reliably.
- The common dictionary word `ferocity` is a difficult long-term head term. Immediate goals are `Ferocity AI`, `Ferocity AI business operating system`, `Ferocity AI workforce`, `Ferocity for service businesses`, and `ferocity.live`.

Added locally on 2026-08-04; deployment pending:

- [x] Change the primary search title to `Ferocity AI | AI Operating System for Service Businesses`.
- [x] Add Organization, WebSite, and SoftwareApplication structured data linking the Ferocity entity, product, and domain.
- [x] Pass focused lint and diff validation for the metadata changes.
- [ ] Deploy the metadata/structured-data changes only with the final owner-authorized release.

External discovery work remaining:

- [ ] Verify `ferocity.live` in Google Search Console.
- [ ] Submit `https://ferocity.live/sitemap.xml`.
- [ ] Request initial indexing for the homepage, features, demo, pricing, integrations, about, growth-system, and business-health-score pages.
- [ ] Configure Bing Webmaster Tools and submit the same sitemap.
- [ ] Establish consistent legitimate Ferocity company/product profiles and link them to `ferocity.live`.
- [ ] Publish an initial useful, problem-led service-business content cluster rather than generic AI articles.
- [ ] Earn legitimate mentions, partnerships, citations, and backlinks; do not use link schemes or promise rankings.
- [ ] Track impressions, branded queries, indexed URLs, clicks, conversions, and qualified signups so Ferocity becomes its first documented SEO case study.

### Customer SEO capability truth and missing end-to-end loop

Working for Starter and above:

- Website/business assessment, business profile, services, service areas, offers, keyword targets, landing-page records, and source tracking.
- A 30-day SEO content plan.
- Draft service pages, city pages, articles, titles, descriptions, internal-link suggestions, GBP ideas, and refresh recommendations grounded in real business information.
- Hosted growth-page drafts, approval/export queues, SEO quality review, Growth Calendar, proof/review reuse, and source-to-revenue records.
- Growth and higher: legitimate authority/link opportunities, backlink health/risk records, service-area intelligence, reusable proof-to-content packages, and visibility workspaces.
- Operator and higher: operator digest and proactive monitoring foundations.

Not complete yet:

- [ ] Customer-facing Google Search Console OAuth, property selection, connection verification, token refresh, and disconnect/reconnect.
- [ ] Search Console query, page, country, device, sitemap, site, and URL Inspection ingestion.
- [ ] Google Analytics property/stream selection and traffic/conversion feedback.
- [ ] Automatic sitemap discovery/submission for authorized customer properties.
- [ ] Live rank/search-performance alerts and recommendations grounded in connected data rather than only internal records or manual imports.
- [ ] Direct publishing and update adapters for priority CMS/website providers.
- [ ] Automatic structured-data installation and validation on customer-controlled external websites.
- [ ] A safe crawl/internal-link graph built from real published URLs.
- [ ] External profile completion workflow and verification tracking.
- [ ] Proof that SEO work produced impressions, leads, booked work, and revenue.

Marketing truth correction required:

- [ ] `Google and AI-search visibility tracking` in the Growth plan must not imply live Google data until the Search Console connection is certified. Either finish the connector before release or qualify the wording as internal/manual/imported visibility planning and tracking.
- [ ] Describe current SEO as planning, assessment, draft generation, proof/authority work, review-first export, and monitoring foundations. Never guarantee indexing, backlinks, rankings, leads, or revenue.

### Google connection is not a website connection

The setup must present two separate customer decisions:

1. **Connect Google data**
   - Search Console: search queries, impressions, clicks, indexed URLs, sitemap state, and URL Inspection data.
   - Analytics: traffic and conversions.
   - Business Profile: locations, Search/Maps presence, reviews, posts, photos, hours, and performance where approved.
   - Ads, Calendar, and email only through separately explained scopes and products.
2. **Connect the website/CMS**
   - Ferocity-hosted site/page: direct controlled publishing.
   - WordPress, Wix, Shopify, Webflow, Squarespace, or another builder: provider-specific OAuth, plugin, or API connection when supported.
   - Custom site: repository/deployment connection, signed webhook, installation path, or review-first export.

Google tells Ferocity what is happening around a website; it does not normally authorize Ferocity to edit that website. A complete SEO workflow generally needs both Google data access and a website/CMS implementation path.

Customer website connection work remaining:

- [ ] Add one plain-language setup flow that asks where the website is hosted/built and chooses the correct connection method.
- [ ] Never request or store the customer's normal website-account password.
- [ ] Prioritize CMS adapters by real customer demand; do not display unbuilt universal compatibility.
- [ ] Verify identity, site, permissions, read/write scope, draft/publish rules, rollback, and audit history for every CMS adapter.
- [ ] Preserve manual export as a functional fallback that includes copy, metadata, structured data, internal links, assets, and exact placement instructions.
- [ ] Ensure Ferocity-hosted public customer pages have correct canonical URLs, indexing controls, sitemap discovery, metadata, structured data, and tenant-safe publication.

### Systemic integration audit required before broad provider claims

- [x] Build one provider truth matrix covering every public integration and every provider shown inside the app. The canonical registry currently covers 26 providers and is enforced by `npm run provider:truth`.
- [x] Classify each as certified live, customer connection required, provider approval pending, limited/read-only, fallback-only, or planned. Verified on 2026-08-05: 7 certified live, 4 connect-account, 2 approval-blocked, 7 limited, 3 planned, and 3 fallback-only.
- [ ] Record the exact customer onboarding path, Ferocity developer account/app requirement, customer account requirement, permissions/scopes, tested reads, tested writes, sync/webhooks, fallback, usage cost, and certification evidence.
- [x] Reconcile that matrix against public plans, features, demos, onboarding, integration cards, readiness pages, and AI-facing language. `npm run public:claims` passes with provider-connection, authorization, fallback, and prepared-work qualifiers present.
- [x] Fail launch checks if a registry-only adapter or missing credential is described as a live capability. `npm run provider:truth` is part of the local predeploy guard and passed for all 26 providers on 2026-08-05.
- [x] Do not ask the owner to discover integration gaps one provider at a time. The canonical provider registry, capability groups, readiness states, and launch guard now provide the platform-wide inventory.

Known long-tail states discovered during this pass:

- Sent.dm, Sendblue, Telnyx messaging, and Google Voice-assisted messaging are registry/planned entries, not live messaging adapters.
- Twilio SMS has a real adapter, but Ferocity-managed production sending is externally blocked by account suspension; manual SMS remains a fallback.
- Twilio, Telnyx, SignalWire, Vonage, generic SIP, and Ferocity-managed phone entries in the phone registry are planned provider implementations unless separately certified elsewhere.
- QuickBooks currently has portable accounting/tax/P&L exports, not a live QuickBooks sync.
- Zapier/Make public apps are roadmap items, not published customer connectors.
- HubSpot and HighLevel remain demand-gated roadmap connectors.
- Housecall Pro requires commercial/partner access for a scalable multi-customer integration.
- ServiceTitan should remain enterprise/design-partner gated.

### Major half-finished or provider-gated capability inventory

This is the current high-level inventory after separating real native workflows from their missing external execution hops.

Communications:

- [x] Native public website chat exists and records conversations, optional consented leads, AI replies, handoff events, and qualification/booking links. It still needs a deployed production smoke and a consistent connection status; an Office Manager seed currently calls embedded chat `future` even though the public API path exists.
- [ ] Ferocity-managed SMS is not live while Twilio is suspended. Keep manual text handoff, email, app alerts, and customer BYO Twilio as explicit alternatives.
- [ ] Owner phone verification and proactive owner briefings need a reliable transactional SMS lane and live OTP certification.
- [ ] Retell customer-outbound voice is certified, but inbound receptionist activation, shared-number multi-tenant routing, owner inbound PIN access, and private owner briefing certification remain separate gates.
- [ ] Vapi has an adapter but no equivalent live certification evidence; label it adapter-ready rather than live.
- [ ] Gmail, Outlook, and Microsoft 365 mailbox monitoring are seeded as `not_connected`; no production mailbox-message ingestion adapter was found. Calendar OAuth must not be presented as email access.
- [ ] Bulk/customer lifecycle email needs connected sender identity, templates, unsubscribe/consent enforcement, quotas, inbound reply mapping, and live certification even though transactional Resend email works.

Marketing, reputation, and publishing:

- [ ] Google Ads, Meta Ads, Reddit Ads, Microsoft Ads, and Yahoo/native ads have planning, credential/OAuth, wallet, source, and approval foundations, but no complete normalized campaign-management execution adapters were found. Account authorization alone must not imply reporting, publishing, or spend works.
- [ ] TikTok Login Kit is not a TikTok Marketing API adapter; follow the separate approval plan above.
- [ ] Google Business Profile has location discovery/read-only review foundations. Profile edits, posts, review replies, notifications, and production write certification remain incomplete.
- [ ] Generic review-platform ingestion and public response execution remain provider-gated. Review-request links and private service-recovery workflows work independently.
- [ ] External CMS publishing is not universal. Manual export and Ferocity-hosted growth pages are the current functional fallbacks.
- [ ] Public social publishing and community replies remain draft/export-first unless a provider-specific execution adapter is certified.

Accounting, payroll, and financial systems:

- [x] Native estimates, invoices, manual payments, online Stripe Connect payment, ledger records, P&L/tax/accounting exports, purchasing, vendor bills, receipts, job costs, and profit records exist.
- [ ] QuickBooks Online two-way synchronization is not implemented; exports are the honest fallback.
- [ ] Payroll records, time, reimbursements, and payroll-export batches exist, but Ferocity does not calculate taxes, file payroll, debit accounts, or submit a certified payroll-provider run.
- [ ] Bank-feed aggregation/reconciliation is not a certified launch capability and should not be implied by P&L or cash-management screens.
- [ ] Refund, dispute, chargeback, bank-return, failed-payout, and support workflows need ongoing Stripe Connect certification beyond the successful basic payment path.

Calendars and incumbent service platforms:

- [x] Native Ferocity scheduling, dispatch, conflict checks, customer confirmations, and private iCalendar feeds work without an external calendar.
- [ ] Google and Microsoft calendar adapters require a complete per-customer OAuth/property selection and production two-way certification before being described as universal sync.
- [x] Jobber has native read-only OAuth and analysis. Write-back remains deliberately off.
- [ ] HighLevel and Housecall Pro currently have signed inbound coexistence bridges, not full native multi-customer OAuth synchronization.
- [ ] ServiceTitan remains partner/design-customer gated.
- [ ] Zapier and Make apps are not published. Generic signed inbound webhooks work, but unrestricted outbound action execution is intentionally disabled.

Advanced operations and construction intelligence:

- [x] Native jobs, estimates, schedules, dispatch assignments, field proof, time, expenses, mileage, inventory, purchasing, equipment records, risk records, and job-health views exist.
- [ ] Advanced road/route optimization is optional/planned; the current route view preserves schedule and groups work without claiming optimized routing.
- [ ] Live supplier catalog/pricing, availability, lead-time, and automatic purchasing connections are not broadly certified. Manual catalogs, quotes, inventory, and approvals remain the fallback.
- [ ] Predictive equipment maintenance needs real telemetry/provider data; current equipment/maintenance records do not provide sensor-based prediction.
- [ ] BIM/IFC object integration, plan/spec contradiction analysis, LiDAR/360/drone reality capture, automated percent-complete verification, and model-to-field comparison remain advanced roadmap capabilities unless separately certified.
- [ ] The AI walkthrough currently uses typed notes as its MVP transcript. Audio, video, drone, wearable-camera ingestion, frame extraction, and visual damage/condition detection are staged behind provider and media-processing work.
- [ ] Construction document answers requiring exact drawing/spec/code citations need a certified document-ingestion, page/section citation, versioning, and conflict-detection pipeline before being sold as complete.

AI and media:

- [x] Ferocity-managed OpenAI text generation, guarded model routing/accounting, and live Veo rendering with cost controls exist.
- [ ] BYO AI is intentionally limited to approved task types; it must never receive Ferocity's protected orchestration/decision layer or silently fall back to Ferocity-paid AI.
- [ ] AI image generation needs a dedicated certified provider adapter and metering path if public claims go beyond graphics/brief preparation.
- [ ] OpenAI video and Vapi code paths should be labeled adapter-ready until separately certified against their production accounts.
- [ ] Media publishing remains approval/provider-gated even when generation succeeds.

Mobile, employee, and customer experience:

- [x] Mobile-friendly employee/technician and customer portal experiences exist, including jobs, time, receipts, proof, estimates, visits, invoices, and messages.
- [ ] Treat the installable web/PWA path as a web app unless native iOS/Android store applications are actually built and released.
- [ ] Push notifications require per-device permission/subscription and must degrade to in-app/email visibility when unavailable.

### Website connection architecture to finish

Ferocity does not need one adapter for every domain name or domain registrar. It needs a small number of connection modes and provider adapters for the systems that control website content.

Universal website onboarding sequence:

1. Accept the public website URL and run a read-only scan with no credentials.
2. Detect likely CMS/host, canonical domain, sitemap, robots, structured data, analytics tags, forms, and obvious technical issues.
3. Ask the customer to verify control through a safe path: provider OAuth, Search Console ownership, DNS TXT/CNAME instruction, HTML meta/file verification, or an approved Ferocity installation snippet.
4. Let the customer choose the implementation path: Ferocity-hosted, CMS OAuth/plugin/API, Git/repository/deployment connection, signed webhook, or manual export.
5. Show the exact permissions Ferocity will receive and whether it can read, draft, publish, roll back, or only export.
6. Publish first to draft/staging when the platform supports it, require approval according to workspace authority, retain before/after content, and support rollback.
7. Verify the live result by re-crawling the URL and checking status, canonical, metadata, structured data, internal links, sitemap discovery, and tracking.
8. Attribute resulting traffic/leads/revenue without claiming causation or guaranteed ranking.

Adapter priorities:

- [ ] **Ferocity-hosted pages:** finish native publication, custom-domain mapping guidance, canonical/indexing controls, sitemap discovery, schema, rollback, and tenant isolation first because Ferocity owns this runtime.
- [ ] **WordPress:** first external CMS adapter because of likely service-business demand. Support OAuth/plugin or application-password style authorization without collecting the normal account password; create/update drafts, media, metadata where available, and verify publication.
- [ ] **Wix, Webflow, and Shopify:** prioritize after real customer demand and provider-app approval. Build separate adapters because their content models and permissions differ.
- [ ] **Squarespace and limited-API builders:** use only supported APIs; otherwise provide installation instructions and complete export packages rather than pretending Ferocity can edit pages.
- [ ] **Custom/Git-based sites:** support an explicitly scoped repository/deployment workflow only after change review, branch/preview, rollback, and deployment isolation are proven.
- [ ] **Universal snippet:** use for lead capture, source attribution, consented chat, and measurement. A snippet does not grant permission to rewrite the website and must never be described as full CMS control.
- [ ] **Domain/DNS providers:** keep optional. Prefer exact manual DNS records for verification/custom domains. Add Cloudflare/registrar adapters only when customers need automated DNS management; never require broad registrar credentials for normal SEO.

### Validation issue discovered during this pass

- [x] Fix the existing TypeScript error in `scripts/sync-jobber-read-model.ts`: `readOnly` was specified more than once in one object construction.
- [x] Re-run repository-wide type checking successfully after the fix.

## Executive status

Ferocity is not ready for an unqualified “everything is live” claim yet. The core application, Stripe Connect, provider-independent voice adapters, owner-command safety layer, workflow definitions, scheduling records, and protected action paths are real. The remaining work is mostly live-provider activation and controlled certification, not another broad redesign.

The correct launch posture is:

- Launch the core operating system after the final release gate.
- Show unavailable provider-dependent actions as connection/setup states, not as working live services.
- Activate and certify each external lane independently so one provider cannot take down or misrepresent the platform.

## The requested items 1–4

### 1. Apply migrations 173–174 — COMPLETE

- `173_owner_conversational_operating_layer.sql` is applied to the production database.
- `174_owner_destination_verification.sql` is applied to the production database.
- These provide private owner conversation preferences, scoped authentication sessions, auditable conversational actions, encrypted destination handling, limited verification attempts, expiration, replay protection, and owner-destination verification state.

### 2. Provision private Retell owner agent — COMPLETE

Completed locally:

- A separate `Ferocity Private Owner Office Manager` is defined.
- It is intentionally distinct from the public receptionist.
- It receives only call-scoped owner name, briefing type, and verified briefing context.
- It cannot treat discussion as approval.
- External actions require explicit approval; schedule, pricing, automation, and other high-impact actions require strong authentication and a second confirmation.
- A separate customer-facing outbound follow-up agent is also defined so Ferocity never uses the private owner agent or inbound receptionist to call customers.
- The provisioning script does not attach the private owner agent to the public number or replace the existing receptionist.

Completed live provisioning:

- A restricted private `Ferocity Runtime` key was created and stored in the Netlify production environment.
- The key was verified directly against Retell before provisioning.
- The private owner Office Manager and dedicated customer outbound follow-up agents were created in Retell.
- `ownerVoiceAssistantId` and `outboundAssistantId` were recorded for the Ferocity workspace.
- The existing public receptionist was not changed or attached to either private purpose.
- Temporary key material used during provisioning was cleared and was not written to source control or documentation.

### 3. Verify the owner's briefing destination — CODE COMPLETE; LIVE OTP PENDING

Completed locally:

- The authenticated owner can save a phone number without storing plaintext.
- Ferocity sends a six-digit, ten-minute verification code.
- Codes are HMAC-protected, one-time-use, limited to five attempts, and limited to three requests per hour.
- A verified destination creates a time-limited strong-auth session.
- The owner can configure voice/text briefings, quiet hours, voicemail behavior, retry behavior, and a maximum number of proactive calls per day.

Current blockers:

- The new setup screen is not on the live site because no frontend deployment was authorized.
- A live SMS provider is not currently active for the Ferocity workspace. The Retell number does not by itself provide SMS delivery.

Safe completion path:

1. Connect a live SMS provider or BYO Twilio/Telnyx route capable of transactional verification texts.
2. Deploy the owner setup UI once the complete frontend release is authorized.
3. Enter the owner number in the authenticated app, receive the code, and enter it in the app.
4. Place one private owner briefing call and verify workspace isolation, authentication, action approval, summary, usage, and opt-out behavior.

Ferocity must not bypass the OTP or manually mark a destination verified.

### 4. Finish job-rescheduling and outbound contact-call commands — ENGINEERING COMPLETE; LIVE VOICE ACTIVATION PENDING

Job rescheduling now:

- Rejects malformed or backward time windows before any write.
- Requires strong owner authentication, explicit approval, and a second confirmation.
- Locks and updates the service job, canonical active service visit, and active dispatch assignments in one database transaction.
- Refuses completed, canceled, or lost jobs.
- Refuses an ambiguous job with multiple active visits rather than guessing.
- When customer notification is requested, requires an SMS live policy, consent, no suppression, and a real destination before committing the schedule.
- Queues the customer update in the existing guarded outbound queue in the same transaction.
- Attempts scoped crew push notifications after commit; the schedule remains visible in the employee app even if a device has no push subscription.
- Records the originating conversation event and user for auditability.

Outbound contact calling now:

- Requires strong owner authentication and explicit approval.
- Requires phone consent, no suppression, a connected provider, a live voice policy, and `live_actions_enabled`.
- Honors each contact's saved `noAiCalls` and `human_call` preferences.
- Uses the existing provider-independent Retell/Vapi adapter.
- Uses the existing managed-voice budget and concurrency gate before calling.
- Requires a dedicated `outboundAssistantId`; it will not substitute the private owner agent or public receptionist.
- Passes scoped business, service, lead/customer, estimate, job, invoice, approved customer-memory, call-purpose, and desired-outcome context through either Retell or Vapi.
- Creates an outbound call record for webhook reconciliation, usage, and audit history.

The valid Retell key and dedicated outbound agent are provisioned. The controlled outbound provider lane and `voice_call` policy are now active with mandatory human approval and phone consent. Customer calls still require a consent record, no active suppression, explicit approval, and one controlled certification call before broader use.

## Current voice architecture

- Retell deprecation check (2026-08-04): no Ferocity source, script, test, build output, dependency, or Git-history call site uses legacy `GET /list-agents`. Retell's supported `POST /v2/list-agents` endpoint was verified successfully against the live account. The provider notice therefore appears to have been triggered by a historical one-off administrative request rather than deployed Ferocity code; no unrelated migration or refactor was introduced.

### Working foundations

- Telephony and voice intelligence are separate.
- Retell and Vapi use interchangeable voice adapters.
- Webhook tenant mapping is based on trusted provider metadata/number mapping, not caller-supplied tenant IDs.
- Retell webhooks require signature verification and reject untrusted tenant mapping.
- Managed voice has tenant-level access checks, concurrency controls, cost ceilings, and emergency-pause records.
- Public receptionist, private owner Office Manager, and customer outbound follow-up are separate agent purposes.
- Call summaries, transcripts, status, duration, direction, outcome, and provider cost can be reconciled into Ferocity call records.
- A dedicated customer-outbound certification call completed through the Ferocity 888 number and was reconciled into Ferocity with its transcript, summary, duration, usage, disconnection reason, and provider cost. It passed connectivity/reconciliation but exposed a conversational-quality failure: the test omitted the real purpose and Business Brain context, so the agent fell back to a vague follow-up.
- The outbound context path now classifies the call purpose and supplies verified business, service, lead/customer, estimate, job, invoice, and approved customer-memory context to Retell or Vapi. Missing detail degrades to natural clarification rather than invention.
- The live Retell customer-outbound prompt now uses the enriched context contract and a real callback-recording tool. The public receptionist and private owner agent remain separate.
- A real interested-lead call on 2026-08-04 exposed remaining outbound quality work: the first attempt failed before audio with `dial_no_answer`; the owner-authorized retry connected for 25 seconds, produced a duplicated partial greeting, asked the lead about his business, and ended on user hangup. Ferocity created exactly two calls and did not initiate an automatic third callback. Require clean greeting, answer-detection, retry-policy, and no-silent-call certification before broader customer-facing outbound use.

### Connected for controlled outbound certification

- The Retell provider account is connected and its controlled outbound lane is enabled.
- The Ferocity number is active for outbound calls; inbound remains disabled.
- The live `voice_call` policy requires both human approval and recorded phone consent.
- The private owner and customer outbound agents are provisioned. The customer-outbound agent has passed transport and reconciliation certification; conversational-quality recertification remains after the enriched context change. Private owner briefings still require destination verification.
- Owner inbound call-in with workspace PIN is not implemented. Private outbound briefings are the safer first release.
- Shared-888 multi-tenant inbound routing is not certified and should not be marketed as available.

## Voice product decisions still required

These are product/pricing decisions, not missing adapter architecture:

1. Decide included managed voice minutes per plan using actual provider cost plus telephony, recording, transcription, AI, support, and failed-call overhead.
2. Decide overage price and whether unused minutes roll over.
3. Define trial minutes, if any. Do not advertise “free” minutes without a hard cost ceiling.
4. Set tenant and global concurrent-call limits for the first 10, 100, and 1,000 customers.
5. Define when Ferocity-managed customers receive a dedicated number versus forwarding an existing number.
6. Keep voice and SMS billing independent even when one provider supplies both.
7. Add owner-visible usage, remaining allowance, spend alerts, and graceful fallback before exhaustion.
8. Require AI disclosure, recording consent where applicable, quiet hours, opt-out, and human escalation by jurisdiction and use case.

## Other work remaining before final deploy

### Owner/provider actions

- [x] Rotate the Netlify personal token that was previously pasted into chat, and store its replacement privately. The exposed token was revoked, its 90-day replacement is stored only in the ignored local environment, and the replacement successfully authenticated the linked `ferocityflo` / `ferocity.live` project.

#### Telnyx autonomous signup and adapter opportunity

- Telnyx publishes an agent-oriented challenge/verification flow at `https://telnyx.com/agent-signup.md`, plus no-account demo endpoints for test-number SMS, inference, speech, and limited voice-AI evaluation.
- This flow provisions a Telnyx account/API key; it does **not** automatically turn Ferocity's planned Telnyx registry entries into working phone or messaging adapters.
- Ferocity currently exposes `telnyx_phone` and `telnyx` through planned provider implementations. They intentionally return unavailable until a real adapter is implemented and certified.
- [ ] Use Telnyx demo endpoints for bounded technical evaluation without representing them as production service.
- [ ] If Telnyx is selected for production, create or link a proper Ferocity business-owned account, complete Telnyx identity, funding, and compliance requirements, and store credentials only in the existing encrypted provider vault. Do not rely on an anonymous agent inbox as the permanent production owner identity.
- [ ] Implement Telnyx behind the existing phone and messaging provider contracts: tenant-owned credentials first, explicit managed lanes separately, number/sender selection, inbound and delivery webhook verification, status normalization, usage attribution, limits, consent, emergency pause, and manual fallback.
- [ ] Certify BYO Telnyx in an isolated QA tenant before considering a Ferocity-managed Telnyx lane. Never allow a trial/bot account or one tenant's credentials to serve another tenant.
- [ ] Keep Telnyx labeled `Planned` until the adapter and production certification pass. Telnyx may become a valuable non-Twilio option, but it must remain replaceable.

- [ ] For Ferocity's own private owner-number OTP/briefing activation, connect a Ferocity-controlled transactional SMS lane or explicitly defer that optional activation until after launch. This does **not** block customer messaging: each customer may connect an eligible BYO provider and use it within that tenant once credentials, consent, registration, limits, and live-send approval pass. One customer's BYO credentials must never send platform-wide verification messages or serve another tenant. The Ferocity-managed Twilio account was upgraded to Pay as you go on 2026-08-03 under Christopher Burton as an individual with a $20 balance and auto-recharge, but Twilio subsequently suspended the account. Treat that managed lane as externally blocked pending provider review. Do not create a duplicate account, generate production credentials, provision numbers, or enable its sends until the suspension is formally cleared. Retell voice and customer-owned/provider-independent paths remain available in the meantime.
- [ ] Reauthorize Jobber for the isolated QA workspace. The production OAuth/read-only sync was previously certified and the encrypted refresh token remains sealed, but the 2026-08-04 refresh attempt was rejected with `The provider connection must be reauthorized`; do not describe the current QA connection as healthy until OAuth completes again. Writes remain disabled.
- [ ] Reauthorize TikTok only when it advances useful certification. Sandbox OAuth previously verified identity `ferocity78`, but its refresh token is now invalid/expired. The signed-in Developer Portal still shows the Ferocity production app as `In review` with only Login Kit and `user.info.basic`; advertising publishing/spend remain unavailable regardless of the separate Ads/Business-account approval.
- [x] Create a clearly labeled low-dollar tenant invoice and approve one real payment-card test. Completed on 2026-08-03: the $1 live Stripe Connect checkout completed successfully.
- [x] Explicitly authorize the final frontend production deployment only after the release candidate is accepted. The release passed 294 tests, lint, type checking, a 69-page build, preview smoke checks, production smoke checks, and was deployed to `ferocity.live`; a canonical-host redirect edge case found post-deploy was fixed, tested, and deployed.

### Engineering/certification work

- [x] Complete the remaining release checks after local changes: the production build generated 69 static pages; local public-route rendering passed; the bounded 120-request load test passed with zero failures and 679 ms p95; the production dependency audit found zero vulnerabilities; migration validation found zero pending migrations; RLS verification passed; and 41 connected-workflow integration checks passed.
- [ ] Certify one private owner briefing call after OTP verification.
- [x] Repeat one realistic customer-outbound call after the enriched context code reaches production, then retain evidence that the agent understood the reason, answered from supplied facts, and created no false callback promise. The 128-second production call correctly identified the roofing-business context, discussed multi-crew coordination and paperwork automation from supplied Ferocity facts, made no false callback promise, retained transcript and summary evidence, and reconciled 23 cents of provider cost.
- [ ] Certify one inbound receptionist call after inbound activation is deliberately approved.
- [x] Certify the low-dollar Stripe Connect invoice from payment link through webhook, invoice balance, ledger, fee, receipt, and payout destination. Completed on 2026-08-03: Stripe reports the session complete and paid, the PaymentIntent and charge succeeded, a receipt URL and receipt email are present, the 1-cent Ferocity application fee was applied, and the charge was created directly on the connected business account. Ferocity's webhook marked the invoice paid, recorded the full $1 payment once, and created one ledger entry.
- [x] Certify one Golden Business Loop from lead through communication, estimate, schedule, field proof, invoice/payment, review, and marketing reuse. Certified in the isolated QA workspace on 2026-08-03 with 13/13 stages complete, zero handoff gaps, and no live provider actions. The run also exposed and fixed a PostgreSQL parameter-type bug that had prevented per-stage audit rows from being retained.
- [x] Complete Jobber OAuth against the deployed production callback and run a read-only sync before enabling writes. The live read-only GraphQL sync completed across clients, requests, quotes, jobs, and invoices; the empty Jobber test workspace correctly returned zero records and writes remain disabled.
- [x] Verify TikTok refresh and connected identity before enabling publishing or spend. `ferocity78` is verified through the sandbox app. Production client credentials are present, but the Developer app remains in review and currently requests only basic-profile permission. Publishing and spend remain disabled; those require separate approved TikTok products/scopes and a controlled live authorization.
- [x] Configure an uptime monitor and status page outside Netlify for total hosting/DNS outage coverage. The existing UptimeRobot account uses `burtonchristopher125@gmail.com`. Its `Ferocity Netlify Supabase health` HTTP monitor checks `https://ferocity.live/api/health/supabase` every five minutes and was confirmed operational on 2026-08-03. It appears on public status page `https://stats.uptimerobot.com/UwiRbbgQU4`. On 2026-08-05 the owner confirmed the existing monitor/page is sufficient for launch; do not create a duplicate account or page. A Ferocity-only page can remain an optional later cleanup if the owner wants to hide unrelated monitors.
- [x] Re-run truth-in-marketing checks so every provider-dependent claim exposes its connection/setup state. Provider connection, authorization, fallback, and prepared-work qualifiers pass; the public company leak guard and UI quality guard also pass.

### Product polish that should not block core launch

- Replace the current safe static walkthrough only when the stronger final Ferocity video is genuinely better.
- Continue voice-quality tuning for latency, interruption handling, turn-taking, pacing, multilingual behavior, and industry-specific knowledge after baseline calls are certified.
- Add inbound owner call-in/PIN only after abuse prevention, workspace mapping, strong authentication, concurrency, and shared-number privacy are proven.
- Add more BYO provider adapters from real customer demand rather than displaying pretend universal compatibility.

### Public legal and SMS compliance package

- [x] Expand the public Privacy Policy and Terms of Service with substantive account, AI, automation, provider, billing, security, data, communications, liability, and mobile-information terms.
- [x] Add public SMS Terms, SMS Consent / Opt-In Policy, Acceptable Use Policy, and Contact / Compliance pages.
- [x] Add a reusable compliance footer to the primary public marketing, setup, pricing, integration, and legal pages without changing their layouts.
- [x] Add a real public SMS opt-in form with an unchecked service-consent checkbox, a separate unchecked optional marketing checkbox, message-frequency and rates disclosures, STOP/HELP instructions, no-purchase requirement, and direct Privacy/SMS Terms links.
- [x] Add server-side consent evidence that stores the normalized number, disclosure version, timestamp, source, and separate service/marketing choices without sending a message or claiming that Ferocity-managed SMS is active.
- [ ] Apply migration 180 and deploy the pages only when the full frontend release is explicitly authorized. After deployment, verify the consent record, STOP/HELP provider behavior, public URLs, and Twilio review screenshot before submitting `https://ferocity.live/sms-opt-in` to Twilio.

## Current verified platform facts

- Production migrations through 179 are applied. Migrations 175-178 add website connections, tenant-selected Google reporting resources, deduplicated platform-owner alerts, and corrected native website-chat readiness. Migration 179 extends the canonical messaging tables with normalized Message Health receipts and retry lineage. Migration 180 is prepared locally for the public Ferocity SMS consent program and is intentionally not applied before deployment authorization.
- A valid restricted Retell runtime key is stored in Netlify production.
- The separate private owner and customer outbound Retell agents are provisioned, their identifiers are recorded, and the public receptionist is unchanged.
- Retell passes the controlled outbound preflight with an active number, configured credentials, a live approval-and-consent policy, and no remaining outbound configuration blockers.
- The dedicated customer-outbound agent completed a 106-second controlled call; Ferocity retained the transcript and summary and recorded 19 cents of provider cost. The call is retained as a failed conversational-quality benchmark, not as proof that customer experience is certified.
- The enriched post-deploy customer-outbound agent then completed a separate 128-second certification call. It understood the roofing-business purpose, answered questions about multiple crews and paperwork from supplied Business Brain context, made no false callback promise, stored transcript and summary evidence, and reconciled 23 cents of provider cost. This closes the customer-outbound conversational-quality recertification gate.
- Type checking passes after the new schedule/call execution paths.
- Targeted owner-conversation/database tests pass: 11 tests across 2 files.
- The full suite passes: 323 tests across 91 files, including Message Health normalization, certified-adapter contracts, out-of-order receipt, filtering-evidence, messaging-lane safety, conversation-timeline health, cross-provider retry safety, and public SMS phone-normalization coverage.
- ESLint passes with no reported errors.
- The production build completes successfully and generates all 75 static pages, including the six new public compliance/SMS routes.
- The local release artifact passed the expanded public/compliance route rendering checks and a bounded 120-request load test at concurrency 12 with zero failures (73.3 requests/second, 705 ms p95, 812 ms p99). The release gate also exposed and fixed a malformed Google OAuth callback that returned 500; missing-state callbacks now return a safe 400 before authentication or tenant access.
- The production dependency audit reports zero known vulnerabilities; migration validation, RLS verification, 41-workflow integration coverage, public-claim qualification, public leak, and UI quality guards all pass.
- Stripe Connect reports card payments active, payouts active, no currently due or past-due requirements, and no database drift.
- Fifty-four active agent workflows are healthy, with zero missing next runs, zero failed last runs, and zero stuck runs. The provider-lane smoke covers 14 capability groups without a platform-wide failure.
- The Golden Business Loop is certified in the isolated QA workspace through all 13 stages with zero handoff gaps; every stage now retains its own audit record. This does not substitute for the separate real Stripe/provider certifications.
- Jobber production OAuth and read-only sync are certified for the isolated QA workspace; write-back remains disabled.
- TikTok Ads/Business approval may be complete, but the Developer app remains visibly in review. Live OAuth, publishing, and spend stay disabled until the relevant production products/scopes are approved and verified.
- No frontend deployment was performed for the 2026-08-04 completion pass. The new truth registry, website UI, Google reporting UI, admin-alert UI, hosted-page SEO changes, and public-copy reconciliation remain local until the owner authorizes the next frontend deploy.

## Final release sequence

1. Rotate the previously exposed Netlify personal token and store its replacement privately.
2. Keep the certified outbound lane behind approval and consent; keep inbound disabled until its separate certification is complete.
3. Connect SMS and verify the owner destination, or defer owner voice activation explicitly.
4. Complete and certify Message Health before enabling any automated messaging lane broadly; keep manual-device and email fallbacks visible until then.
5. Run controlled owner, customer-outbound, and receptionist certifications for only the directions being launched.
6. Complete low-dollar Stripe Connect and Golden Loop certifications.
7. Complete the full local release suite and visual review.
8. Review plan/pricing language against actually enabled provider lanes.
9. Obtain explicit owner approval for the frontend production deploy.
10. Deploy once.
11. Complete OAuth callbacks that require the deployed URL, monitor production, and disable only a failing provider lane rather than the platform.
