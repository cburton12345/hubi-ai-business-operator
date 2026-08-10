# Ferocity integration platform evaluation and roadmap

**Date:** July 31, 2026
**Scope:** Jobber, Housecall Pro, HighLevel (GoHighLevel), ServiceTitan, HubSpot, Google Business Profile, Google Calendar, Microsoft Outlook, Stripe, QuickBooks Online, Zapier, and Make
**Decision stage:** Roadmap established; the first implementation wave is now local and database-applied, but not frontend-deployed.

> July 31 implementation note: the review-request destination and fallback foundation was implemented in migration 155. Native Google and Outlook calendar adapters, shared cursor/mapping/conflict infrastructure, and independently authorized outbound calendar writes were added in migration 159. Google Business Profile location discovery and read-only review monitoring were added in migration 160. The signed service-platform coexistence bridge was added in migration 161. Native Jobber OAuth, encrypted rotating credentials, PKCE, bounded rate-aware reads, and the provider-owned analysis model were added in migration 162. Real provider consent and end-to-end production-account certification still follow deployment; all Jobber writes remain off. The release deployment is intentionally pending.

## Executive decision

Ferocity should not attempt to build every connector at once. It should finish and certify the connections that directly affect getting paid and running the daily schedule, then add local-growth and accounting connections, then add coexistence/migration bridges to competing CRMs.

Recommended order:

1. **Certify the existing Stripe and Stripe Connect implementation.** Do not rebuild it.
2. **Build native Google Calendar two-way sync.** Keep the existing revocable iCalendar feed as the no-key fallback.
3. **Build native Microsoft Outlook Calendar two-way sync through Microsoft Graph.**
4. **Start Google Business Profile access approval now, then finish and certify its native adapter.** Its approval delay can run in parallel with calendar work.
5. **Build QuickBooks Online in controlled stages:** accounting export/import first, then customer/invoice/payment sync, then carefully governed two-way sync.
6. **Build Jobber as the first field-service coexistence and migration connector.**
7. **Build HighLevel as the first marketing-CRM coexistence connector.**
8. **Publish Ferocity triggers/actions for Zapier and Make** after Ferocity's public integration contract is stable. Use them for the long tail, not core payments or real-time operational control.
9. **Add HubSpot after actual customer demand is demonstrated.**
10. **Pursue Housecall Pro partner access before scheduling implementation.** Use middleware only for a narrow interim bridge where it is sufficient.
11. **Treat ServiceTitan as an enterprise program, not an early connector.** Build it only with a committed design partner and approved production access.

This sequence maximizes customer value while avoiding three expensive mistakes: duplicating working Ferocity systems, building against APIs that Ferocity is not yet approved to use, and creating brittle two-way synchronization before data ownership rules exist.

## What Ferocity already has

The repository already contains the foundation that these integrations should reuse:

- Tenant-scoped `integration_connections` and `integration_jobs` records with row-level security.
- A standard OAuth initiation/completion layer, encrypted tenant credential storage, OAuth job state, refresh-token storage, and connection records.
- Signed webhook foundations and integration job history.
- A connector runtime that distinguishes executable adapters, native fallbacks, and setup-only providers.
- Provider request tracking and a guarded adapter factory that does not permit unreviewed provider code to become live.
- Private, revocable iCalendar feeds as a working calendar fallback.
- Portable accounting, tax, P&L, invoice, vendor-bill, and ledger exports as a working QuickBooks-independent fallback.
- Stripe subscription billing, Checkout, webhook handling, connected-account foundations, direct-charge support, fee policies, and payment-provider account records.
- Internal canonical customers, leads, jobs, appointments, estimates, invoices, payments, messages, workflows, approvals, audit events, and provider-usage controls.

### Current gaps and inconsistencies

- Google and Microsoft calendar OAuth now have native provider adapters, incremental cursors, mappings, conflict detection, and explicit outbound-write permission. They still require real-account OAuth certification after deployment; the keyless calendar feed remains the truthful zero-key fallback.
- QuickBooks is correctly a native export fallback, not a live QuickBooks sync.
- Google Business Profile now has token refresh, location discovery, tenant-isolated location selection, and read-only review monitoring. It must not be marketed as fully live until Google approves the production project and a real account passes consent, reads, revocation, failure recovery, and any future governed write path end to end.
- Stripe is materially implemented, but the QA matrix still calls for a staging webhook-retry/idempotency test. It should be certified before expanding payment scope.
- The generic connection/job tables are useful but do not by themselves provide a complete synchronization contract. Native two-way connectors still need external-ID maps, cursors, idempotency keys, conflict policy, dead-letter/replay handling, and per-object ownership rules.

## Scoring method

Scores are 1 (low) to 5 (high). **Priority score** weights the decision toward customer value without ignoring delivery risk:

- ROI: 30%
- Customer demand: 25%
- Ease of implementation: 20%
- Strategic value: 25%

Ease includes approval friction, test environment quality, API consistency, and synchronization complexity. Middleware is scored as an integration channel rather than as a customer system of record.

| Value rank | Platform | ROI | Demand | Ease | Strategic | Priority / 5 | Decision |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | Stripe / Stripe Connect | 5 | 5 | 4 | 5 | **4.80** | Certify existing native implementation first |
| 2 | Google Calendar | 5 | 5 | 5 | 4 | **4.75** | Build native first |
| 3 | Google Business Profile | 5 | 5 | 3 | 5 | **4.60** | Apply now; build/certify native after access |
| 4 | QuickBooks Online | 5 | 5 | 3 | 4 | **4.30** | Build native in controlled stages |
| 5 | Zapier / Make channel | 4 | 5 | 4 | 4 | **4.25** | Publish Ferocity app after API contract stabilizes |
| 6 | Microsoft Outlook Calendar | 4 | 4 | 4 | 4 | **4.00** | Build native immediately after Google Calendar |
| 7 | Jobber | 4 | 4 | 3 | 4 | **3.80** | First field-service coexistence connector |
| 8 | HighLevel | 4 | 4 | 3 | 4 | **3.80** | First marketing-CRM coexistence connector |
| 9 | Housecall Pro | 4 | 4 | 2 | 4 | **3.60** | Obtain partner access first; do not promise a date |
| 10 | HubSpot | 3 | 3 | 4 | 3 | **3.20** | Wait for demonstrated demand |
| 11 | ServiceTitan | 4 | 3 | 1 | 4 | **3.15** | Enterprise/design-partner only |

The numerical rank is not the entire build order. For example, Zapier/Make scores well but should follow a stable Ferocity API contract; Google Business Profile scores highly but is gated by Google approval.

## Platform evaluations

### 1. Stripe and Stripe Connect

**API and OAuth:** Excellent. Stripe has mature REST APIs, versioning, official SDKs, signed webhooks, restricted keys, and Connect OAuth. OAuth authorization codes are mode-specific and must be exchanged with matching test or live credentials. Ferocity should prefer modern Connect account-controller configurations and Stripe-hosted or embedded onboarding rather than collecting business-verification data itself.

**Developer and sandbox access:** Excellent. Stripe Sandboxes and test mode support simulated payments, failures, disputes, onboarding, and Connect OAuth without moving money.

**Limits:** The current official baseline is 100 API operations/second in live mode and 25/second in sandbox, with a typical 25/second endpoint limit and stricter resource-specific limits. Connect account creation is limited to 5/second in sandbox and 30/second live. Handle `429` and `Stripe-Rate-Limited-Reason` explicitly.

**Pricing:** Standard US online domestic-card pricing is currently 2.9% + 30 cents per successful transaction, with additional fees for some card/payment situations. Connect cost and liability depend on configuration. Stripe states that a SaaS platform can avoid Connect-related platform fees when Stripe sets pricing and charges the connected account directly. That aligns with Ferocity's current preference: each service business remains merchant of record, owns its payout account, and normally pays processor fees.

**Supported high-value actions:** Ferocity subscriptions, hosted Checkout, billing portal, payment links, invoice collection, saved payment methods, refunds, disputes, connected-account onboarding/status, application fees, payouts, and reconciliation.

**Complexity:** Medium because Ferocity already has substantial implementation. The hard part is operational certification: idempotency, webhook replay, account status, refunds/disputes, ledger reconciliation, fee disclosure, and live/test isolation.

**Business value:** Highest. It enables Ferocity to collect subscription revenue and lets tenants get paid online without Ferocity holding their funds.

**Recommendation:** **Certify and harden now; do not redesign.** Use direct charges where the tenant is merchant of record and Stripe can own risk/fees. Do not use middleware for payment execution or ledger truth.

Official sources: [Stripe Connect OAuth](https://docs.stripe.com/connect/oauth-reference), [testing Connect](https://docs.stripe.com/connect/testing), [rate limits](https://docs.stripe.com/rate-limits), [Connect SaaS architecture](https://docs.stripe.com/connect/saas-platforms-and-marketplaces), [pricing](https://stripe.com/pricing).

### 2. Google Calendar

**API and OAuth:** Excellent. OAuth 2.0 supports granular calendar scopes. The API can list calendars, read/create/update/delete events, query free/busy, manage attendees, and use incremental sync tokens. Push notification channels avoid wasteful polling.

**Developer and sandbox access:** Good. There is no special partner contract. Use a separate Google Cloud test project and test users; Google recommends a separate test-only project for quota behavior. OAuth verification may be required when Ferocity requests sensitive scopes for public use.

**Limits:** As of May 1, 2026, new projects have 10,000 requests/minute/project, 600 requests/minute/user/project, and a 1,000,000-request daily threshold before future charges. Standard use is currently no additional cost; Google says billing above the daily threshold is planned later in 2026 with advance notice. Operational write limits also apply to individual calendars.

**Pricing:** No separate standard API charge today. The customer may have a free Google account or paid Workspace subscription. Ferocity must monitor Google's announced post-threshold billing change.

**Supported high-value actions:** Technician/owner availability, appointment creation and updates, reminders through event notifications, customer/employee attendees, job links, recurring work, conflict detection, and schedule overlays.

**Complexity:** Low-to-medium. Recurrence, time zones, deletions, attendee notifications, and conflict ownership require care, but documentation and testing are strong.

**Business value:** Extremely high. Calendar coexistence removes adoption friction and prevents double-booking without asking a small business to abandon its current calendar.

**Recommendation:** **First new native connector.** Start with one-way Ferocity-to-Google plus inbound change notifications; add governed two-way edits after conflict rules pass. Preserve the private iCalendar feed as the zero-setup fallback.

Official sources: [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [create events](https://developers.google.com/workspace/calendar/api/guides/create-events), [push notifications](https://developers.google.com/workspace/calendar/api/guides/push), [usage limits and pricing](https://developers.google.com/workspace/calendar/api/guides/quota).

### 3. Google Business Profile

**API and OAuth:** Strong but access-gated. OAuth 2.0 with `business.manage` supports offline access. The federated APIs cover account/location management, business information, reviews and replies, local posts, media, Q&A, verifications, notifications, place actions, and performance insights.

**Developer and sandbox access:** Weak-to-medium. Google requires a valid business reason, Cloud project, Google account, and valid business website, followed by an access application. Google says review commonly takes up to 14 days. There is no fake production Business Profile test account; use mocks plus a legitimate controlled listing.

**Limits:** A quota of zero means the project has not been approved. Standard Business Information API quota is 300 queries/minute, with action-specific daily limits including 300 location creates, 300 Google-location searches, and 10,000 location updates.

**Pricing:** No separately documented per-call GBP API fee. The material cost is implementation, access review, OAuth verification, moderation risk, and ongoing compliance.

**Supported high-value actions:** Sync hours/contact/service data, review monitoring and approved replies, approved posts/offers/events, photo/media workflows, listing issues, location verification support, and performance metrics such as calls, directions, bookings, and website clicks.

**Complexity:** Medium-high because of approval, multiple APIs, no true sandbox, listing moderation, and public-facing write risk.

**Business value:** Extremely high for local service businesses. Reviews, local visibility, accurate hours, and lead attribution directly affect revenue.

**Recommendation:** **Submit/maintain access now and finish the native adapter once approved.** Start read-only with location discovery, reviews, and performance. Require authority rules for replies, posts, and business-information changes. Never let an AI autonomously change name, primary category, address, or ownership.

Official sources: [GBP overview and eligibility](https://developers.google.com/my-business/content/overview), [OAuth](https://developers.google.com/my-business/content/implement-oauth), [API functions](https://developers.google.com/my-business/content/faq), [quota limits](https://developers.google.com/my-business/content/limits).

### 4. Microsoft Outlook Calendar through Microsoft Graph

**API and OAuth:** Excellent. Microsoft identity platform OAuth 2.0 authorization-code flow with PKCE supports delegated permissions; Microsoft Graph provides calendars, events, recurring events, calendar groups, categories, attachments, free/busy, change notifications, and delta/change tracking.

**Developer and sandbox access:** Good. Microsoft recommends a dedicated Entra test tenant, available through the Microsoft 365 Developer Program or manual tenant creation. Use separate test and production app registrations.

**Limits:** Outlook resources are limited per app/mailbox to 10,000 API requests per 10 minutes, four concurrent requests, and 150 MB of writes/uploads per five minutes. Microsoft also applies global and service-specific throttles; honor `429` and `Retry-After` and use change notifications/delta rather than polling.

**Pricing:** Microsoft Graph itself is generally included with the relevant Microsoft 365 service; customer licensing controls the resources/features available. No standalone per-call price is published for ordinary calendar usage.

**Supported high-value actions:** Same operational schedule value as Google Calendar, plus Microsoft 365 contacts/mail expansion later if justified.

**Complexity:** Medium. Multi-tenant Entra configuration, consent, delegated-versus-application permissions, recurring events, and mailbox throttling require deliberate handling.

**Business value:** High. Many established contractors and office teams live in Outlook/Microsoft 365.

**Recommendation:** **Second native calendar connector.** Share one canonical calendar adapter with Google, but keep provider-specific recurrence IDs, notification subscriptions, and throttling behavior inside the Microsoft adapter. Do not bundle full email access into the first calendar consent request.

Official sources: [OAuth authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [test environment](https://learn.microsoft.com/en-us/entra/identity-platform/test-setup-environment), [Calendar API overview](https://learn.microsoft.com/en-us/graph/api/resources/calendar-overview), [Graph throttling](https://learn.microsoft.com/en-us/graph/throttling), [service-specific limits](https://learn.microsoft.com/en-us/graph/throttling-limits).

### 5. QuickBooks Online

**API and OAuth:** Strong. Intuit uses OAuth 2.0 authorization code flow, one-hour access tokens, rolling refresh tokens, company `realmId`, webhooks, REST and newer GraphQL capabilities.

**Developer and sandbox access:** Excellent. A developer account receives a sample sandbox company; up to ten Plus/Advanced sandboxes can be created, valid for two years. OAuth Playground and separate development/production credentials are available.

**Limits:** REST is limited to 500 requests/minute/realm and 10 requests/second/realm/app in sandbox and production. Batch endpoints recommend no more than 30 payloads. Intuit's Builder tier currently includes 500,000 CorePlus calls/workspace/month before throttling; commercial program terms should be confirmed before launch.

**Pricing:** Developer sandboxes are available without a customer subscription. Live customers need a compatible QuickBooks Online plan; plan pricing and promotions change. Ferocity should not subsidize the customer's accounting subscription.

**Supported high-value actions:** Customers, items/services, estimates, invoices, payments, expenses, bills, vendors, taxes, accounts, attachments, projects, budgets, and change orders where supported by the customer's SKU/API.

**Complexity:** Medium-high. Accounting semantics, tax treatment, sparse updates, version tokens, duplicate records, closed periods, reconciliation, and source-of-truth conflicts matter more than the OAuth work.

**Business value:** Very high. It removes duplicate entry and gives owners/accountants clean books while Ferocity remains the operational system.

**Recommendation:** **Native, phased build.** Phase A maps Ferocity exports and imports chart/customer/vendor references. Phase B sends approved customers/invoices/payments. Phase C imports payment/expense status. Two-way edits come only after ownership rules are explicit. Keep Ferocity's portable exports permanently.

Official sources: [OAuth setup](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0), [sandbox FAQ](https://developer.intuit.com/app/developer/qbo/docs/develop/sandboxes/sandbox-faqs), [limits](https://developer.intuit.com/app/developer/qbo/docs/learn/limits-and-throttles), [sandbox management](https://developer.intuit.com/app/developer/qbo/docs/develop/sandboxes/manage-your-sandboxes).

### 6. Jobber

**API and OAuth:** Strong. Jobber exposes a versioned GraphQL API using OAuth 2.0 authorization code flow, scopes, rotating refresh tokens, queries/mutations, and signed webhooks. Versions are supported for at least 12 months.

**Developer and sandbox access:** Good. A 90-day developer test account and built-in GraphiQL/OAuth sandbox are available. Draft apps can connect to up to five paying Jobber accounts before marketplace approval is required.

**Limits:** 2,500 requests per five minutes per app/account plus a GraphQL cost bucket of 10,000 points restoring at 500 points/second. Webhooks are at-least-once, HMAC-signed, must receive a response within one second, and require idempotent asynchronous processing.

**Pricing:** No separate public API usage charge is documented. Customers pay for Jobber plans, whose current public pricing varies by team size and commitment. Ferocity's connector should not require the customer to upgrade beyond whatever Jobber requires for app installation.

**Supported high-value actions:** Clients, properties, requests/leads, quotes, jobs/visits, invoices, payments, users, products/services, custom fields, and webhook-driven changes, subject to current schema/scopes.

**Complexity:** Medium. GraphQL is clean, but complete two-way mapping across jobs, visits, invoices, and statuses is substantial.

**Business value:** High. It provides migration and coexistence for Ferocity's exact service-business audience.

**Recommendation:** **First field-service connector.** Begin with a guided import and read-only continuous sync. Next, allow Ferocity to write qualified leads and approved appointments. Avoid full bidirectional job/invoice ownership until customers prove they need long-term coexistence rather than migration.

Official sources: [Jobber API overview](https://developer.getjobber.com/docs/), [getting started/test account](https://developer.getjobber.com/docs/getting_started/), [OAuth](https://developer.getjobber.com/docs/building_your_app/app_authorization/), [rate limits](https://developer.getjobber.com/docs/using_jobbers_api/api_rate_limits/), [webhooks](https://developer.getjobber.com/docs/using_jobbers_api/setting_up_webhooks/).

### 7. HighLevel (GoHighLevel)

**API and OAuth:** Strong. The public REST API supports OAuth 2.0, private integration tokens, scoped agency/location installs, contacts, conversations, messaging, calendars, opportunities, payments, products, workflows, and 50+ webhook events. Ferocity should use OAuth for a multi-customer public integration; legacy v1 is out of support.

**Developer and sandbox access:** Good. Developers can create private apps first and test with controlled agency/sub-accounts before marketplace distribution. There is not a separate full sandbox equivalent to Stripe/Intuit; use dedicated test sub-accounts.

**Limits:** API v2 currently allows 100 requests per 10 seconds per marketplace app/resource (location or company) and 200,000 requests/day per app/resource, with rate-limit headers.

**Pricing:** HighLevel currently lists Starter at $97/month, Unlimited at $297/month, and Agency Pro at $497/month, with API access and usage-based communications/AI/workflow charges varying by plan. These are customer/provider costs, not costs Ferocity should absorb.

**Supported high-value actions:** Contact and opportunity migration, conversation history where allowed, appointments, pipeline stages, workflows, message handoff, payment/order references, tags/custom fields, and webhooks.

**Complexity:** Medium. Scope varies at agency versus location level, and the platform overlaps heavily with Ferocity. The main problem is defining which system owns contacts, conversations, automations, and pipeline state.

**Business value:** High for agencies and businesses already using HighLevel. It can reduce switching friction and import existing marketing assets/data.

**Recommendation:** **Native after Jobber, initially as migration/coexistence.** Prefer importing contacts/opportunities/appointments and optionally exporting qualified leads. Do not mirror two autonomous workflow engines in both directions; that creates loops, duplicate messages, and uncontrolled provider charges.

Official sources: [HighLevel API](https://marketplace.gohighlevel.com/docs/), [authorization options](https://marketplace.gohighlevel.com/docs/Authorization/authorization_doc/), [OAuth and rate limits](https://marketplace.gohighlevel.com/docs/oauth/Faqs/), [current pricing](https://www.gohighlevel.com/pricing), [usage pricing guide](https://help.gohighlevel.com/support/solutions/articles/155000001156-highlevel-pricing-guide).

### 8. Zapier and Make

These are best evaluated as distribution and long-tail integration channels, not as Ferocity's core workflow engine.

**API and OAuth:** Both support custom apps, OAuth 2.0, triggers/actions/searches, and webhooks. Zapier's visual platform uses OAuth authorization code and can refresh tokens. Make supports OAuth code/PKCE/client-credentials patterns, dedicated/shared webhooks, actions, searches, polling triggers, and universal API calls.

**Developer and sandbox access:** Good. Both allow private development/testing before publication. Ferocity must expose a stable, scoped OAuth/API contract and webhook/event catalog before a public app is worthwhile.

**Limits and pricing:** Zapier pricing is task-based: free currently includes 100 tasks/month; Professional starts at $19.99/month, Team at $69/month, with pay-per-task behavior on paid plans. Make is credit-based: Free includes 1,000 credits/month; at 10,000 credits/month Core is $12, Pro $21, and Teams $38. Make's own management API is limited by plan from 60 requests/minute on Core to 1,000/minute on Enterprise. Third-party provider limits still apply in addition to middleware limits.

**Supported high-value actions:** Long-tail lead capture, spreadsheet/storage/document systems, notifications, simple record creation, noncritical reporting exports, and customer-defined edge cases.

**Complexity:** Low-to-medium for a useful first app; high if attempting complete parity with Ferocity. Each exposed action still needs scopes, validation, idempotency, tenant isolation, rate limits, audit logs, and authority rules.

**Business value:** High breadth and reduced pressure to natively build every obscure provider.

**Recommendation:** **Build a Ferocity Zapier app and Make app after the canonical public API is stable.** First triggers: new qualified lead, estimate status changed, job completed, invoice paid, approval requested. First actions: create/update lead, create customer, create appointment request, attach note, request a Ferocity workflow. Never expose an unrestricted “execute anything” action.

Do not use middleware for payment execution/ledger truth, high-volume messaging, live dispatch state, voice call control, compliance enforcement, provider-cost caps, tenant authentication, or authority decisions. Middleware can fail, pause when credits run out, retry unexpectedly, or introduce another party into sensitive data flows.

Official sources: [Zapier OAuth](https://docs.zapier.com/integrations/build/oauth), [Zapier authentication](https://docs.zapier.com/integrations/build/auth), [Zapier pricing](https://zapier.com/pricing), [Zapier task rates](https://zapier.com/pricing/rates), [Make OAuth](https://developers.make.com/custom-apps-documentation/app-components/connections/oauth2), [Make modules](https://developers.make.com/custom-apps-documentation/app-structure/modules), [Make API rate limits](https://developers.make.com/api-documentation/getting-started/rate-limiting), [Make pricing](https://www.make.com/en/pricing).

### 9. HubSpot

**API and OAuth:** Excellent. HubSpot supports OAuth authorization code for multi-account apps, scoped public/private apps, refresh tokens, signed webhooks, and broad CRM object, property, association, pipeline, search, engagement, tickets, quotes, and communication APIs.

**Developer and sandbox access:** Excellent. Configurable developer test accounts, localhost OAuth during development, CLI tooling, and marketplace review paths are available.

**Limits:** Publicly distributed OAuth apps are currently limited to 110 requests per 10 seconds per installed HubSpot account, excluding CRM Search. Search and some APIs have separate stricter limits.

**Pricing:** HubSpot has a free CRM tier (currently up to two users and 1,000 contacts) and paid hubs/seats/usage credits. Prices vary materially by hub and tier; Ferocity should link to current pricing during setup rather than embedding a plan claim.

**Supported high-value actions:** Contacts, companies, deals, appointments, calls, communications, emails, tasks, tickets, services, quotes, subscriptions, pipelines, properties, custom objects, and associations.

**Complexity:** Medium. Technically clean, but HubSpot's flexible objects/properties and product-tier-dependent scopes require dynamic capability discovery and mapping.

**Business value:** Medium for Ferocity's initial local service-business market, higher for B2B/commercial service firms with sales teams.

**Recommendation:** **Wait until customer demand.** When built, begin with CRM import and qualified-lead/deal coexistence. Middleware is acceptable for isolated, low-volume lead handoffs before native demand justifies a connector.

Official sources: [OAuth](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/oauth/working-with-oauth), [test accounts](https://developers.hubspot.com/docs/developer-tooling/local-development/configurable-test-accounts), [CRM APIs](https://developers.hubspot.com/docs/api-reference/latest/crm/understanding-the-crm), [API limits](https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines), [webhooks](https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide), [pricing](https://www.hubspot.com/pricing/crm).

### 10. Housecall Pro

**API and OAuth:** Capable but commercially gated. Housecall Pro's public API supports customer, employee, lead, job, estimate, invoice-related data, attachments, and many webhooks. Individual Pro accounts use API keys; verified integration partners use OAuth 2.0.

**Developer and sandbox access:** Restricted. API keys are available only on the MAX plan, and a multi-customer OAuth integration requires a contractual integration partnership approved at Housecall Pro's discretion. No self-service sandbox equivalent is documented.

**Limits:** Housecall Pro documents `429` responses and a `RateLimit-Reset` header but does not publish a numeric general limit. Capacity must be confirmed during partnership discussions.

**Pricing:** API-key access requires the customer's MAX plan. Partner commercial terms are not public. The cost/access uncertainty is a delivery risk.

**Supported high-value actions:** Create/read customers, employees and jobs; leads; job links/attachments; and webhook events across customers, leads, estimates, jobs, invoices, payments, and employees, subject to endpoint/partner permissions.

**Complexity:** High until partnership access is secured; medium-high technically after access because job/estimate/invoice synchronization is broad.

**Business value:** High for home-service migration/coexistence, but not enough to justify speculative development without access and mutual customers.

**Recommendation:** **Apply for partner access and obtain written scope/terms first.** For immediate narrow cases, Housecall Pro's Zapier integration offers only limited native triggers/actions, while MAX users can use webhooks. Middleware can handle simple lead/customer handoff, but it is not a substitute for a full native connector.

Official sources: [Housecall Pro API](https://docs.housecallpro.com/), [API access overview](https://help.housecallpro.com/en/articles/8505035-api-overview), [Zapier/webhook capabilities](https://help.housecallpro.com/en/articles/5452973-zapier-integration-overview).

### 11. ServiceTitan

**API and OAuth:** Broad and powerful. ServiceTitan v2 APIs cover CRM, bookings, dispatch, jobs, estimates, pricebook, inventory, accounting, payments, payroll/settings, marketing, reporting, and more. Authentication uses OAuth 2.0 client credentials plus an app key; access tokens expire after 900 seconds and no refresh token is issued.

**Developer and sandbox access:** Access-gated. ServiceTitan provides one integration environment (sandbox equivalent) per developer/customer request. Third-party developers receive demo data and integration access, but production requires relationship/approval and tenant installation. Public apps must be approved before tenants see them.

**Limits:** ServiceTitan documents throttling and recommends caching access tokens, but a simple universal numeric API limit is not publicly stated in the reviewed official material. Export versus transactional APIs have different operational patterns; implementation must react to `429`/provider headers and use export feeds for bulk synchronization.

**Pricing:** ServiceTitan uses custom per-technician pricing and requires a sales quote. API/partner commercial terms are not publicly fixed.

**Supported high-value actions:** Nearly the full service-business operating model—customers, locations, leads, bookings, jobs, technicians, dispatch, estimates, invoices/payments, pricebook, inventory, memberships, accounting, and reporting.

**Complexity:** Very high. The breadth, tenant-specific credentials, production approval, short-lived tokens, enterprise data volumes, and contractual storage/deletion restrictions make this a program rather than a connector sprint.

**Business value:** High for larger contractors, but initial Ferocity customers are more likely to need a simpler system or migration away from complexity.

**Recommendation:** **Wait for a committed enterprise design partner.** Build read-only export/import first, then selected leads/appointments. Do not use Zapier/Make as the authoritative bridge for enterprise dispatch, payments, or accounting.

Official sources: [developer portal](https://developer.servicetitan.io/), [OAuth](https://developer.servicetitan.io/docs/oauth20), [environment/access FAQ](https://developer.servicetitan.io/docs/faqs-apis-app-keys-client-keys/), [register an app](https://developer.servicetitan.io/docs/getting-started/register-an-app), [pricing](https://www.servicetitan.com/pricing).

## Native versus middleware decision

| Capability | Native Ferocity connector | Middleware acceptable | Reason |
| --- | --- | --- | --- |
| Subscription checkout and tenant customer payments | **Yes** | No | Money, idempotency, disputes, ledger and tenant isolation |
| Calendar availability and job appointments | **Yes** | Temporary one-way only | Double-booking and recurring-event conflicts need deterministic ownership |
| Google Business Profile reviews/performance/posts | **Yes** | Limited reporting alerts | High strategic value and public-write governance |
| QuickBooks invoices/payments/accounting sync | **Yes** | One-way export/import only | Financial truth and reconciliation |
| Jobber/HighLevel core coexistence | **Yes when demanded** | Narrow lead handoff | Multi-object sync and automation-loop risk |
| HubSpot basic lead/deal handoff | Later | **Yes initially** | Adequate for low-volume demand discovery |
| Housecall Pro basic lead/customer handoff | After partner decision | **Yes, limited** | Partner/API gating; middleware action coverage is narrow |
| ServiceTitan operational system | Design-partner native | No for critical state | Enterprise scope, dispatch and financial risk |
| Obscure/long-tail apps | Usually no | **Yes** | Breadth without permanent native maintenance |

## Required common architecture before native connector expansion

Do not create a new integration subsystem. Extend the existing one with these common contracts:

1. **Canonical object map:** external provider/object/ID/version mapped to Ferocity workspace and canonical entity.
2. **Sync cursor and lease:** one cursor per tenant/provider/object stream, with exclusive worker lease and last-success watermark.
3. **Webhook inbox:** verify signature first, persist raw event metadata safely, acknowledge quickly, process asynchronously, deduplicate, retry, and dead-letter.
4. **Idempotency:** every write gets a stable operation key; repeated webhook/poll/retry must not duplicate leads, appointments, invoices, payments, or messages.
5. **Field ownership and conflict rules:** for each mapped field specify Ferocity-owned, provider-owned, latest-write-wins, or human-review. Money and completed job history should never use blind latest-write-wins.
6. **Authority integration:** reads may run automatically; low-risk writes follow saved authority; public, financial, customer-communication, and destructive actions follow existing approval/consent rules.
7. **Capability discovery:** connection state must include granted scopes, customer plan/SKU limitations, verified read/write capabilities, and last successful health check—not merely stored credentials.
8. **Rate/cost governor:** tenant queues, backoff, jitter, provider headers, daily budgets, circuit breakers, and isolation so one customer's import cannot impair others.
9. **Audit and observability:** correlation ID, actor, source, before/after summary, external IDs, attempt count, provider request ID, safe error category, and replay controls.
10. **Disconnect and deletion:** revoke tokens, stop subscriptions, preserve required business audit data, delete provider data when required, and leave Ferocity records in a clear disconnected state.

### Canonical ownership defaults

- **Ferocity owns:** authority, AI decisions, workflows, job-risk intelligence, customer lifecycle orchestration, provider-cost rules, and cross-provider audit history.
- **Calendar provider owns:** user-created external event details unless explicitly adopted into a Ferocity job/appointment.
- **Ferocity owns operational jobs:** external FSM records are imported/coexisting references unless a customer explicitly selects the other system as source of truth during transition.
- **QuickBooks owns posted accounting classification and closed-period books; Ferocity owns operational estimate/job/invoice context.**
- **Stripe owns payment processor status; Ferocity owns the business invoice and reconciled payment ledger reference.**
- **GBP owns published listing/review state; Ferocity owns drafts, approval decisions, and recommended next actions.**

## Implementation status — coexistence and native Jobber read wave

Ferocity now has a tenant-scoped, signed middleware coexistence bridge for **Jobber, HighLevel, and Housecall Pro**. It is deliberately labeled as a bridge, not native OAuth. A customer can keep the system they prefer and send canonical contact, lead, and job changes into Ferocity through provider webhooks, Zapier, Make, or another approved middleware path.

The bridge currently provides:

- external-ID mapping and safe retry deduplication;
- contact/customer, lead, and job upserts into Ferocity's canonical service records;
- provider-owned field/mapping status so Ferocity does not silently become the source of truth;
- tenant-isolated bearer credentials stored only as hashes;
- delete handling that detaches a provider mapping without erasing Ferocity history;
- outbound writes disabled by default to prevent automation loops and duplicate customer communication;
- failed-event retries without replaying already-completed events.

Jobber now also has a native read-only OAuth path with a real developer application, staged production credentials, encrypted rotating tokens, verified account identity, cost-aware pagination, sync cursors, and provider-owned summaries for clients, requests, quotes, jobs, and invoices. Signed bridge ingestion remains available as a fallback. Production OAuth and data certification require the deployed callback, and signed Jobber webhooks should be configured only after that endpoint is live. HighLevel still needs a provider developer application, OAuth credentials, provider-specific webhook verification, polling/backfill, capability discovery, and a test tenant before it can be represented as native. Housecall Pro still requires partner/API access for a multi-customer native integration.

## Implementation roadmap

### Phase 0 — connector contract and Stripe certification

- Freeze the canonical integration contract above.
- Resolve the Google Business Profile runtime-status inconsistency; require a capability probe before “executable” is displayed.
- Test Stripe live/test isolation, signed webhook replay, duplicate events, delayed/out-of-order events, failed subscription payment, refunds, disputes, Connect onboarding status, direct charge, payout-account requirement changes, and ledger reconciliation.
- Confirm tenant-owned direct charges and fee/liability disclosures.
- Define dashboard health states: connected, action required, degraded, paused, disconnected.

**Exit:** Stripe is proven end to end and no connector can be called live based only on credentials/OAuth.

### Phase 1 — calendars

- Implement shared `CalendarProvider` operations over the existing connector layer.
- Google first, Microsoft second.
- Read calendars and free/busy; choose calendars; create Ferocity-owned events; store provider event/version IDs; consume push/change notifications; support update/cancel; reconcile conflicts.
- Keep employee/user preference hierarchy and one-time override behavior.
- Keep iCalendar feed available for customers who decline OAuth.

**Exit:** A job appointment created or moved in either permitted system updates once, does not loop, respects time zones, and cannot double-book silently.

### Phase 2 — Google Business Profile and QuickBooks

- Complete GBP access/verification while calendar work proceeds.
- GBP read-only release: locations, reviews, performance, listing health.
- GBP governed writes: reply draft/approval, post draft/approval, safe hours updates. Keep identity/address/category changes manual.
- QuickBooks Phase A/B: company/capability discovery, mapping, customers/items, approved invoice/payment export, webhook ingestion, reconciliation dashboard.

**Exit:** GBP claims match proven capabilities; accounting sync cannot create duplicates or silently rewrite posted books.

### Phase 3 — migration and coexistence

- Jobber guided import, continuous read sync, then approved lead/appointment writes.
- HighLevel contact/opportunity/appointment import, then qualified-lead export.
- Customer chooses source of truth per object during onboarding.
- Add migration-complete mode that disconnects ongoing sync cleanly.

**Exit:** A customer can move to Ferocity without retyping its active business and can coexist without automation loops.

### Phase 4 — ecosystem distribution

- Publish scoped Ferocity OAuth/API endpoints and signed outbound events.
- Release Zapier and Make private beta apps, then public listings.
- Enforce tenant limits and authority on actions requested through middleware.
- Measure requested providers and successful task volume to choose future native builds.

**Exit:** Customers can connect long-tail tools without Ferocity claiming those tools are native or allowing middleware to bypass safety controls.

### Phase 5 — demand-gated connectors

- HubSpot after enough qualified customers request it.
- Housecall Pro only after partner approval, API terms, test access, and committed mutual customers.
- ServiceTitan only with a design partner, production access plan, data-retention review, and enterprise support capacity.

## Product and pricing policy

- Include standard calendar connections in paid Ferocity plans; they are retention infrastructure, not a metered luxury.
- Include GBP read/monitoring in the growth-oriented tier; approval-gated posting can differentiate higher tiers without charging by trivial internal “runs.”
- Offer QuickBooks sync in a higher operating tier or add-on because support and reconciliation cost are real; preserve free portable exports in every appropriate plan.
- Treat Jobber/HighLevel/HubSpot/Housecall Pro/ServiceTitan imports as onboarding value. Charge for ongoing two-way coexistence when it creates sustained support and API cost.
- Let customers pay their own third-party subscriptions and usage charges by default.
- Do not silently subsidize Zapier/Make tasks, HighLevel wallet usage, provider communications, payment processing, or accounting subscriptions.
- Show expected external requirements before Connect: customer plan requirement, provider approval, likely provider charge owner, requested data, and whether the connection is native or middleware.

## Immediate next actions before code

1. Confirm the current Stripe staging/live certification checklist and close the remaining webhook-retry test.
2. Submit or verify Google Business Profile API access and OAuth verification status.
3. Approve the canonical sync/ownership contract in this document.
4. Create developer/test tenants for Google Calendar, Microsoft 365, QuickBooks, Jobber, and HighLevel without connecting customer production data.
5. Contact Housecall Pro partnerships for written OAuth, sandbox, rate-limit, commercial, and marketplace terms.
6. Defer ServiceTitan production work until a real design partner exists.
7. Only then open implementation tasks, one provider at a time, beginning with Google Calendar.

## Final classification

### Build/certify first

- Stripe / Stripe Connect certification
- Google Calendar
- Microsoft Outlook Calendar
- Google Business Profile access plus native adapter certification
- QuickBooks Online staged native integration

### Build next

- Jobber
- HighLevel
- Ferocity app for Zapier and Make

### Wait for demand or access

- HubSpot
- Housecall Pro
- ServiceTitan

### Middleware-first use cases

- Low-volume HubSpot lead/deal handoff
- Narrow Housecall Pro lead/customer handoff while partnership is evaluated
- Long-tail CRMs, forms, spreadsheets, storage, notifications, and customer-specific systems

### Never middleware-only for core truth

- Payments, payouts, refunds, disputes, and financial ledger
- Real-time scheduling/dispatch ownership
- High-volume or regulated communications
- Voice call control and emergency routing
- Consent, suppression, authority, tenant security, and provider-cost enforcement
