# Ferocity provider-neutral paid media

Reviewed: 2026-09-23

## Product contract

Ferocity is the business operating and learning layer. Ad networks are execution channels. A campaign is created once from a business goal, adapted to eligible destinations, gated by account and spend controls, measured through the full customer lifecycle, and improved from qualified leads, sold work, revenue, and gross profit—not clicks alone.

The system must never describe an advertiser signup, a funded account, a login, or a developer application as a working API integration. These are separate readiness gates:

1. advertiser/business account exists;
2. developer application or API product is approved;
3. Ferocity is authorized to the correct customer account;
4. billing and policy status are valid;
5. tracking and conversion feedback are verified;
6. initial historical sync and recurring sync are healthy;
7. live actions are enabled for the workspace;
8. the customer explicitly approves the budget and launch.

## What was already strong

- Provider connection lanes and customer-owned versus Ferocity-managed ownership.
- Prepaid managed-ad controls, hard caps, approval gates, and append-only spend events.
- Canonical content distribution, creative variants, experiment records, and asset storage.
- Growth events, attribution touches, source-to-cash lifecycle data, and conversion feedback queues.
- Recurring growth jobs and owner-facing recommendations.

## Gaps closed in this pass

- A single paid-media capability registry for Meta, Google, TikTok, Microsoft, LinkedIn, X, Reddit, Pinterest, Snap, Amazon, OpenAI Ads, and Apple Ads.
- Honest provider/account states and documented approval limitations.
- A normalized read model for connections, campaigns, ad groups, creatives, performance snapshots, sync runs, and action audit records.
- Explicit downstream outcome metrics: Ferocity leads, qualified leads, appointments, sold jobs, revenue, gross profit, and attribution confidence.
- A setup assessor that tells the user the next provider-controlled step instead of saying only “connected” or “not connected.”
- A cross-channel allocation proposal that favors business outcomes and capacity fit. It can recommend changes, but cannot move money without approval.
- Canonical paid destinations for all modeled networks. Uncertified networks deliberately produce a manual/approval path rather than pretending to publish.

## Playad comparison

Playad publicly presents connections for ad accounts, analytics, and MMPs; initial and daily synchronization; campaign launch and updates; budget allocation; creative generation and testing; reporting; and competitor tracking. Its public product pages also describe AI image/video/avatar generation.

Ferocity should match the useful mechanics without becoming a disconnected ad dashboard. Its structural advantage is first-party operating context: calls, conversations, CRM state, estimates, schedules, capacity, jobs, invoices, collections, margin, reviews, repeat business, and approvals. The closed loop is:

`business goal -> plan -> creative -> approval -> provider execution -> lead/conversation -> sale -> delivery -> cash/profit -> learning`

Playad references:

- https://playad.ai/pricing
- https://playad.ai/docs/user-guide
- https://playad.ai/docs/user-guide/connections
- https://playad.ai/creatives

## Provider truth matrix

| Network | Ferocity state now | What still gates live use |
|---|---|---|
| Meta | Waiting for platform/app approval | Approved Marketing API scopes, correct asset authorization, tracking certification |
| Google | Setup required | OAuth, developer access, account relationship, billing, tracking certification |
| TikTok | Waiting for API for Business approval | App approval, advertiser authorization, billing/tracking certification |
| Microsoft | Setup required | OAuth/developer token, selected account, billing, tracking certification |
| LinkedIn | Waiting for product approval | Advertising API plus any Lead Sync/Conversions products required |
| X | Waiting for Ads API approval | Approved access/tier and advertiser authorization |
| Reddit | Advertiser account exists; API setup required | Approved developer application and OAuth; the draft $50/day campaign remains unlaunched |
| Pinterest | Setup required | Business/developer app, OAuth, billing, tracking |
| Snap | Setup required | Business organization, OAuth app, advertiser account/funding, tracking |
| Amazon | Setup required | Eligible developer and advertiser/DSP entity access |
| OpenAI Ads | Setup required | Eligible advertiser account and server-side Advertiser/Conversions API keys |
| Apple Ads | Setup required when relevant | Eligible app advertiser, API user/key, billing |

Instagram is a Meta placement, not a duplicate provider. YouTube is a Google Ads placement. Ferocity models these as placements beneath their real provider account.

## Connection categories

- **Ad accounts:** permissions, account discovery, campaign structure, budget, creative, status, reporting.
- **Analytics:** provider reporting, Ferocity analytics, GA4, Search Console.
- **Attribution/MMP:** Ferocity closed-loop attribution first; Appsflyer, Adjust, Branch, and Singular are optional adapters for app businesses.
- **CRM and first-party:** Ferocity CRM plus approved coexistence connectors.
- **Website tracking:** tracked links, forms/chat, pixels/tags, and server-side conversion feedback.
- **Creative/media:** Ferocity assets, customer uploads, image/video generation, and provider-native assets.

## Spend and change safety

- No campaign launch, budget increase, billing mutation, or account payment occurs from a recommendation.
- All paid destinations require a budget and explicit approval.
- Managed service requires prepaid funding, hard daily/monthly caps, a configured fee policy, and ledger-backed reconciliation.
- Every proposed or executed provider mutation receives an idempotency key and audit record.
- Expired/revoked credentials, stale sync, provider rejection, or missing tracking blocks live actions and shows the exact next step.

## Customer authentication boundary

Normal customers never create Ferocity's developer applications or provide client secrets, app secrets, developer tokens, callback configuration, or webhook infrastructure. Ferocity owns those platform credentials once per provider. Customer authorization is tenant-scoped and normally looks like:

`Connect -> provider sign-in -> consent -> account selection -> encrypted tenant token -> read-only sync`

Platform client credentials and customer tokens are stored separately. The customer can revoke Ferocity from the workspace and from the provider. Where a provider does not offer delegated OAuth suitable for SaaS customers, Ferocity uses a provider-supported account invite or managed-service model, or marks the network unavailable; it must not ask an ordinary customer for a developer secret.

## Platform identity versus Ferocity advertising

Use the same truthful, verified Ferocity legal business where required, but isolate assets and permissions:

- Dedicated production developer applications and platform system users.
- A separate Ferocity internal advertiser/ad account for marketing Ferocity itself.
- Separate sandbox/test advertiser assets for certification.
- Customer-owned advertiser accounts authorized through the production developer app.
- Separate roles, billing profiles, tokens, audit trails, and emergency kill switches.

This reduces blast radius but cannot guarantee that a provider will never correlate enforcement across a business. Providers may act at the ad, ad-account, user, business, developer-app, or organization level depending on the violation. Creating fake identities or extra businesses to evade enforcement is prohibited and increases risk. The defense is policy-compliant advertising, least privilege, isolated assets, stable ownership, monitoring, and immediate pause/revocation controls.

## Normalized data and recurring operations

Migration `229_provider_neutral_paid_media.sql` adds normalized paid-media read models while keeping secrets in the existing encrypted credential vault. Recurring workers should populate sync runs and snapshots using provider adapters; they must back off on rate limits, retain cursors, and remain replay-safe.

Initial sync should import the maximum practical provider-supported history. Incremental sync should use a small overlap window to reconcile late attribution. Conversion feedback must be idempotent and must store the provider response.

## Adding provider number 13

1. Add one provider definition and official-document links to `paid-media-provider-registry.ts`.
2. Implement the provider adapter behind the existing connection/action interfaces.
3. Map provider entities into the normalized paid-media tables.
4. Add capability/readiness truth and destination adaptation.
5. Add contract, authorization, reporting, rate-limit, failure, and conversion-feedback tests.
6. Certify with a controlled account before changing any capability to live.

Core Ferocity business logic, attribution, approval, budget, creative, and owner UX must not be rewritten for a new network.

## Current account facts

The detailed, non-secret inventory is maintained in `docs/ferocity-account-inventory.md`. Passwords, recovery codes, API keys, access tokens, and card data do not belong in that file or source control.

No campaigns were launched and no billing or spend changes were made during this implementation pass.
