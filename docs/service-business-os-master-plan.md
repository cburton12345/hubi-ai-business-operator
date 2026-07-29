# Ferocity Service-Business OS Master Plan

Status: migrated release candidate; external provider activation and the
owner-authorized frontend deployment remain.

This is the authoritative plan for making Ferocity a credible AI operating
system for service businesses. It supersedes narrower field-service gap lists,
but it does not erase their technical history.

## Product Standard

Ferocity should not win by exposing more modules than ServiceTitan, Jobber,
Housecall Pro, or HighLevel. It should win by making the business easier to run.

The operating promise is:

> Ferocity watches the whole business, understands what is happening, and
> safely runs the next useful action.

Every launch-critical capability must have:

1. A clear user input.
2. Canonical persisted state.
3. A trigger or responsible worker.
4. A downstream consumer.
5. An owner, office, field, or customer-facing result.
6. Recovery and audit history.
7. Consent, authority, provider, and cost controls where applicable.

The transactional source of truth must remain deterministic. AI can interpret,
recommend, prepare, and act within authority, but it must not invent payments,
taxes, time records, inventory movements, contract acceptance, or schedule
reservations.

## Target Customer

The first replacement target is a service business with roughly one to ten
field workers that has outgrown spreadsheets and disconnected point tools.

Ferocity should not claim full ServiceTitan replacement until the enterprise
items in this document are complete and production-certified.

## Canonical Operating Model

The primary service lifecycle is:

`Customer -> Location -> Asset -> Opportunity -> Estimate -> Work Order -> Visit -> Invoice -> Payment`

Supporting records attach to that lifecycle:

- conversations and consent;
- appointments and schedule reservations;
- worker and crew assignments;
- forms, checklist responses, signatures, and field media;
- time, mileage, expenses, materials, inventory, and purchase orders;
- memberships, warranties, and recurring visits;
- AI decisions, approvals, actions, provider attempts, and audit events;
- reviews, referrals, retention, attribution, and repeat revenue.

Existing leads, service jobs, operations assignments, revenue appointments, and
other working records remain supported. The canonical service layer should link
and normalize them rather than replace them in one risky rewrite.

## Information Architecture

### Primary navigation

1. Today
2. Customers
3. Schedule
4. Work
5. Money
6. Growth
7. Insights

Ask Ferocity remains persistently available. Setup, AI authority, integrations,
billing, access, diagnostics, and advanced tooling belong under Settings or an
advanced drawer.

### Daily product questions

- Today: What needs attention, what can make money, and what is blocked?
- Customers: Who are we serving, and what do they need next?
- Schedule: Who is going where, when, and can the promise be kept?
- Work: What must be completed and documented?
- Money: What is estimated, owed, paid, profitable, or risky?
- Growth: How do we create and retain demand?
- Insights: What should change?

## Implementation Program

### Phase 1 - Canonical service kernel

- [x] Customer locations with contacts, access instructions, service zones,
      coordinates, and billing/service distinctions.
- [x] Customer assets/equipment with manufacturer, model, serial, install date,
      condition, warranty, and service history.
- [x] Work orders representing the commercial scope of work.
- [x] Visits representing schedulable field occurrences.
- [x] Explicit links to existing leads, opportunities, estimates, service jobs,
      assignments, invoices, and recurring plans.
- [x] Visit assignments, statuses, cancellation/no-show reasons, arrival
      windows, actual timestamps, and completion state.
- [x] Canonical event history and idempotent synchronization.
- [x] Migration-safe backfill from existing customer/job/assignment records.

Definition of done: an existing estimate-to-job flow can create or link a work
order and at least one visit without breaking existing routes.

### Phase 2 - Scheduling, dispatch, capacity, and routing

- [x] Service types with expected duration, skills, crew size, and territory.
- [x] Worker skills, working hours, time off, certifications, and service areas.
- [x] Schedule board with day/week/team views and an unscheduled-work tray.
- [x] Fast form-based scheduling and assignment as the accessible equivalent
      to drag/drop; visual drag/drop is not required for launch.
- [x] Conflict, overtime, travel, skill, certification, and capacity checks.
- [x] Dispatch states: unassigned, assigned, confirmed, dispatched, en route,
      arrived, in progress, paused, complete, no-show, and canceled.
- [ ] Route stops, coordinates, sequence, travel estimates, and provider-ready
      optimization.
- [x] Secure customer confirmation, reschedule-request, and cannot-attend
      responses connected to the canonical visit and operating history.
- [ ] Provider-delivered reminder, on-my-way, running-late, and arrival
      workflows.
- [ ] Calendar provider read/write sync with reconciliation.
- [x] AI dispatcher recommendations with owner-configured authority.

Definition of done: an office user can schedule and reassign a visit, see why a
worker is or is not eligible, notify affected people, and recover from a failed
provider action.

### Phase 3 - Field application and job forms

- [x] One intentionally simple mobile-first field home plus canonical visit
      view for work, customer, scope, history, checklists, proof, expenses,
      time, mileage, acknowledgment, directions, and the daily work list.
- [ ] In-visit material consumption, invoice payment, and next-stop routing
      without leaving the canonical visit.
- [x] Offline cache for assigned work and a device-local mutation queue.
- [x] Conflict-aware synchronization and visible sync status.
- [x] Configurable form and checklist templates.
- [x] Required questions, conditional sections, photos, files, measurements,
      signatures, and customer-visible outputs.
- [x] Completion rules that can block completion for missing required evidence.
- [ ] Voice-to-field-note and AI daily-report drafting.
- [ ] Equipment and warranty updates from completed field work.

Definition of done: a worker can complete the normal visit lifecycle with poor
connectivity and the office receives a complete, auditable record afterward.

### Phase 4 - CRM, pricebook, estimates, memberships, and portal

- [x] CRM exact-match duplicate detection and owner-confirmed, audited safe merge.
- [x] Customer tags, custom fields, multiple contacts, locations, and
      communication preferences.
- [x] Pricebook services, materials, labor assemblies, equipment, images,
      margin rules, regional overrides, and good/better/best packages.
- [x] Pricebook-controlled estimates, deposits, optional items, signatures,
      change requests, and financing interest.
- [x] Membership/service agreements with benefits, discounts, renewal,
      automated visit generation, billing, pause/cancel, and churn handling.
- [x] Unified customer portal for requests, estimates, approvals,
      deposits, appointments, work history, equipment, invoices, payments,
      receipts, documents, messages, memberships, reviews, and referrals.

Definition of done: an ordinary customer can move from request to approved and
paid work without navigating unrelated public links.

### Phase 5 - Invoicing, payments, accounting, and procurement

- [ ] Production-certified Stripe payment links and connected accounts.
- [ ] Deposits, partial payments, saved methods where permitted, recurring
      charges, ACH, refunds, disputes, chargebacks, and reconciliation.
- [ ] Tax configuration, discounts, credits, write-offs, statements, and
      progress billing.
- [ ] Financing provider interface without implying approval or rates.
- [ ] QuickBooks Online OAuth, mapping, export/import, replay, conflict
      handling, and audit history.
- [x] Inventory locations/bins, serialized items, vehicle stock, transfers,
      receiving, returns, cycle counts, reorder suggestions, and reservations.
- [x] Purchase-order receiving connected to audited inventory, plus vendor-bill
      review and provider-safe accounting export queues.
- [x] Evidence-backed job margin, cash collection, purchasing risk, invoice
      reminder, and owner-attention recommendations.

Definition of done: money shown in Ferocity can be reconciled to the provider
and accounting system without manual re-entry or ambiguous state.

### Phase 6 - Communications, retention, and growth

- [x] One canonical shared-inbox model across voice, chat, SMS, email, portal, and social
      sources.
- [x] Assignment, unread state, collision protection, SLA, summaries, handoff,
      and stop-on-response behavior.
- [ ] Live provider activation and certification.
- [x] Missed-call, estimate, invoice, nurture, reactivation, review, referral,
      membership, warranty, and CLV employee foundations.
- [x] Provider-independent publishing queues, customer-owned connection lanes,
      ad reporting/attribution records, and manual export fallbacks.
- [x] Outcome state from replies, appointments, wins, gross profit, opt-outs,
      satisfaction, and retention feeds lifecycle, reporting, and owner
      attention; deeper model optimization remains future work.

Definition of done: automation stops or changes course when the customer or
business state changes, rather than continuing a static sequence.

### Phase 7 - Workforce, recruiting, analytics, and platform depth

- [x] Applicant tracking, interviews, offers, onboarding, documents,
      certifications, expirations, training, and separation.
- [x] Timekeeping, mileage, expenses, reimbursements, payroll-export records,
      compensation-rule foundations, and review queues.
- [ ] Certified payroll-provider delivery, commission calculation, and
      prevailing-wage rules.
- [x] Technician, dispatcher, marketing, pricebook-margin, membership,
      capacity, callback, warranty, and shared-inbox reporting foundations.
- [ ] Deeper CSR outcome, callback/warranty quality, and retention cohort
      reporting.
- [x] Versioned customer imports from incumbents with dry-run, validation, reconciliation,
      and rollback-safe batches.
- [ ] Public API, webhooks, idempotency, integration marketplace contract, and
      developer documentation.
- [ ] Enterprise SSO, stronger audit exports, retention policies, backup/restore
      verification, and multi-location controls.

Definition of done: owners can understand performance, migrate safely, and
operate Ferocity as a dependable system of record.

## AI Workforce Responsibilities

AI employees should own outcome monitoring and bounded action:

- Receptionist: respond, qualify, book, recover missed calls, and escalate.
- Dispatcher: match capacity, skills, geography, promises, and risk.
- Estimator: turn evidence into reviewed scope, options, pricing, and warnings.
- Job coordinator: detect missing prerequisites, delays, changes, and proof.
- Customer care: summarize history, prepare updates, and prevent service
  recovery from colliding with marketing.
- Revenue manager: recover estimates and invoices, nurture, reactivate, and
  measure lifetime value.
- Inventory/procurement manager: forecast materials and prevent stockouts.
- Recruiting coordinator: qualify applicants and maintain credential readiness.
- Growth manager: connect content and campaigns to attributable revenue.
- Owner chief of staff: present the few decisions that matter.

AI must defer deterministic or high-risk facts to the relevant source of truth.

## Variable-Cost Architecture And Profitability

The default commercial rule is:

1. Do not limit deterministic, low-cost product activity merely to manufacture
   scarcity.
2. Protect actual provider cost with per-workspace cost caps, idempotency,
   provider ownership, and an emergency pause.
3. Prefer customer-owned provider accounts for ad spend, unusual channels, and
   high-volume commodity delivery.
4. When Ferocity pays a provider, include a defensible allowance or prepaid
   credit and charge enough to preserve margin.
5. Never silently absorb processing, carrier, rendering, payout, refund,
   dispute, bank-return, or premium-provider charges.
6. A usage charge remains reviewable and visible before it reaches the
   customer subscription invoice.

### Metered-service audit

| Cost source | Existing architecture | Surgical release decision | Remaining live gate |
| --- | --- | --- | --- |
| AI text and vision | Token usage, estimated provider cost, plan-based cost caps, workspace policies, fallback behavior, and emergency pause exist. Core AI is cost-capped rather than restricted by an arbitrary command count. | Keep useful core AI bundled. Protect it by dollar cost, use smaller models where sufficient, cache deterministic context, and reserve premium models for work that earns their cost. | Revalidate model rate-card environment values whenever the provider or model changes. |
| AI images | Graphics jobs and provider-ready media controls exist, but live generation depends on the selected provider. | Use credits or a small included allowance; block or require prepaid approval at exhaustion. Do not promise unlimited rendering. | Connect the chosen image provider, meter actual image size/quality, and certify failure/refund behavior. |
| AI video | Scripts, scenes, briefs, and provider-ready jobs exist. Rendered video is correctly presented as premium usage. | Keep planning included; sell actual renders through prepaid credits or approved managed production. | Choose the provider and meter seconds/generations, retries, audio, and failed renders before activation. |
| SMS/MMS | Provider-independent messaging, consent/suppression, idempotency, per-account unit/cost caps, usage meters, and pending rebilling charges exist. Conservative segment cost estimates now protect the cap before sending. | BYO messaging has no Ferocity delivery markup. Ferocity-managed delivery uses a configurable conservative cost estimate plus a margin floor and requires charge review. | Finish Twilio registration, verified inbound/delivery webhooks, live test sends, and replace estimates with provider-reconciled costs. Twilio currently publishes destination, number-type, segment, carrier, and registration-dependent pricing: https://www.twilio.com/en-us/sms/pricing/usa |
| Voice | Call, transcript, recording, usage, allowance, duration, concurrency, failed-payment, and spend-limit records exist. | Sell minutes/bundles or prepaid credits; cap duration and concurrency; degrade to take-a-message or forwarding instead of allowing runaway calls. | Finish provider account/number setup, consent and recording policy, webhook certification, and real provider-cost reconciliation. |
| Transactional email | Shared messaging and send gates exist; provider usage is now estimated and can be capped. | Prefer customer-owned email for larger workspaces. A managed pooled lane may include a generous allowance because unit cost is low, but overage must be capped or rebilled. | Verify domain reputation, inbound route, bounce/complaint handling, and reconcile provider usage. Resend currently prices paid overage in 1,000-email blocks: https://resend.com/docs/knowledge-base/what-is-resend-pricing |
| Bulk/marketing email | Separate bulk-email service gate, opt-out handling, and provider ownership controls exist. | BYO by default. Do not let a low subscription tier create unlimited deliverability liability or contact-based provider charges. | Certify the selected broadcast provider, consent provenance, unsubscribe synchronization, and contact-tier cost behavior. |
| File storage and egress | Private buckets and file-size/type controls existed. Migration 129 adds atomic workspace quota reservations, a usage ledger, plan defaults, failed-upload release, and billing visibility. | Include practical storage by plan and block new uploads at the hard ceiling; offer a plan upgrade or explicit storage add-on instead of silent overage. | Run migrated-environment concurrency and deletion/reconciliation tests. Supabase currently includes storage by plan and charges overage by GB-month: https://supabase.com/pricing |
| Payments | Customer payment links, ledgers, Connect foundations, fee policies, and explicit managed-payment gating exist. | Customer-owned processing fees stay with the customer. Managed payments must disclose the platform fee and pass through provider-side refund, dispute, chargeback, bank-return, payout, and instant-payout fees. | Complete Connect onboarding, refunds/disputes, payout reconciliation, webhook replay, and small live-money tests. |
| Advertising | Customer-owned and managed budget lanes are separated; managed spend requires approval, prepaid balance, daily/monthly caps, and a live-spend switch. | BYO ad accounts by default. Managed ads require prepaid media money and a separately disclosed management fee. | Provider OAuth, read-only reporting first, then tightly approved launch/budget actions. |
| Maps, routing, calendar, accounting, publishing, SEO data, and other APIs | Provider ownership, credential vault, action queues, webhook history, and integration readiness records exist. | Prefer BYO for high-volume or niche providers. For Ferocity-paid APIs, add the provider to the unified usage meter and hard-cap it before enabling live actions. | Add actual adapters, idempotent reconciliation, and provider-specific rate cards as each lane becomes live. |

The defaults in `.env.example` are conservative safety estimates, not customer
price promises. Provider invoices remain authoritative. Current public pricing
also confirms why storage cannot be treated as free forever and why SMS must be
metered by segment rather than by conversation.

### Cost-control gaps closed in this pass

- Messaging caps now consider projected message segments and estimated cost
  before sending, instead of checking only historic usage.
- Messaging usage no longer records a false zero provider cost.
- Ferocity-managed messaging creates auditable pending charges with explicit
  owner approval and void controls before Stripe synchronization.
- Storage now has an atomic reservation ledger and workspace hard cap across
  receipt and customer-proof uploads.
- Managed ad spend remains prepaid and capped.
- Core AI remains available based on provider-dollar budgets instead of
  arbitrary "AI run" scarcity.

### Cost-control work that must remain gated

- Provider cost estimates must be reconciled to real Twilio, voice, email,
  image, video, storage, and third-party invoices before automated rebilling.
- Stripe usage charges must be aggregation-tested so customer invoices remain
  understandable at scale.
- Storage deletion, retention, legal hold, egress, image transformation, and
  orphan cleanup need production policies.
- No premium media, managed ad, managed payment, or managed communications lane
  may become live merely because its schema exists.

## Competitive Gates

### Credible HighLevel replacement

- Live shared communications.
- Flexible pipeline and event automation.
- Calendar availability and booking.
- Provider-certified AI receptionist.
- Connected forms, websites, reputation, campaigns, and attribution.

### Credible Jobber / Housecall Pro replacement

- Mature scheduling and dispatch.
- Offline field execution.
- Pricebook and field estimates.
- Unified customer portal.
- Live payments and accounting sync.
- Recurring work, equipment history, forms, and checklists.

### Credible ServiceTitan replacement

- Everything above plus commercial and multi-location depth, call-center
  operations, inventory/procurement, payroll/commissions, fleet, enterprise
  reporting, migration, API ecosystem, and proven production scale.

## Release Rules

- Do not deploy the frontend or create a Netlify preview without explicit owner
  authorization.
- Do not apply live database migrations without explicit owner authorization.
- Do not label provider-ready work as live.
- Preserve existing working workflows and add compatibility links before
  retiring duplicate records or routes.
- Add automated integration checks for every new canonical workflow.
- Test desktop, 390px mobile, unauthenticated public routes, authenticated
  operator routes, and offline/retry behavior before release.

## Progress Log

- [x] Comprehensive architecture and incumbent audit completed.
- [x] Customer lifecycle, native website chat, referral attribution, voice
      handoff, industry knowledge, and review delivery repair completed locally.
- [x] Phase 1 canonical service kernel implemented locally.
- [x] Phase 2 scheduling and dispatch foundation implemented locally.
- [x] Phase 3 field forms, completion gates, and offline execution foundation
      implemented locally.
- [x] Phase 4 pricebook, membership, and connected portal foundation
      implemented locally.
- [x] Phase 5 deterministic money, inventory, procurement, payment exception,
      and accounting sync foundations implemented locally.
- [x] Phase 6 canonical inbox and stop-on-response foundation implemented
      locally; live providers remain certification-gated.
- [x] Phase 7 recruiting and rollback-safe customer import foundation
      implemented locally.
- [x] Customer appointment response, purchasing/receiving, service-performance
      reporting, projected messaging cost, usage-charge review, and atomic
      storage-quota gaps closed locally.
- [x] Final local release suite passed against the final source state.
- [x] Migrations 117-129 applied to the authorized Ferocity Supabase project;
      the full database now records all 134 repository migrations.
- [x] RLS owner/outsider verification and 118-route public, protected, and
      authenticated crawl passed against the migrated database.
- [x] Desktop and 390px Edge visual QA passed for conversion, owner, schedule,
      purchasing, reporting, and field surfaces. The field-app hydration and
      compact-metric defects found during the pass were repaired and retested.
- [x] Resend domain, OpenAI, Stripe subscriptions/prices, core provider lanes,
      production Netlify environment alignment, and a reversible live Stripe
      checkout were certified.
- [x] Generic messaging webhooks now fail closed and require a current
      timestamped HMAC signature; the production secret is provisioned.
- [ ] Activate and certify Twilio/voice after the separate Ferocity Twilio
      account is authenticated and its business registration is approved.
- [x] Keep accounting, calendar, and location useful without provider accounts:
      portable accounting CSVs, private iCalendar feeds, and ZIP/city/radius
      route clustering are native. QuickBooks OAuth, two-way calendar edits,
      and road-network optimization remain optional upgrades.
- [ ] Activate premium video, TikTok, Yahoo, and managed Stripe Connect only
      after their provider accounts, budgets, and controlled tests are ready.
- [ ] Expand the validated import engine from customers to jobs, estimates,
      invoices, pricebook records, memberships, assets, and attachments.

## Current Gap Analysis

| Capability | Current state | Remaining work before a production claim |
| --- | --- | --- |
| CRM and service history | Canonical customers, contacts, locations, assets, tags, exact-match duplicate review/merge, work orders, visits, and history are implemented. | Add fuzzy duplicate scoring and richer segment/custom-field UI. |
| Scheduling and dispatch | Eligibility, conflicts, assignment, dispatch state, unscheduled work, AI scanning, secure customer confirmation/change links, ZIP/city route clusters, and private iCalendar feeds are implemented. | Add richer week/crew interaction; optional road-network optimization and two-way provider calendar reconciliation can remain account-gated. |
| Field execution | Mobile visit view, dynamic required forms, signature, completion blocking, and conflict-aware offline queue are implemented. | Add offline attachments/signatures/time/material mutations, at-rest device encryption strategy, and end-to-end poor-connectivity testing. |
| Estimates and pricebook | Catalog-backed line items, cost/margin visibility, packages schema, options, deposits, and public acceptance are connected. | Finish package builder UX, change-order UX, tax rules by jurisdiction, and financing-provider handoff. |
| Memberships | Benefit definitions, renewal/billing state, due-visit generation, and portal visibility are connected. | Add production recurring billing, dunning, pause/cancel self-service, and churn reporting. |
| Portal | Requests, messages, visits, equipment, documents, estimates, payments, memberships, and proof share one customer link. | Add self-booking availability, portal authentication choices, file upload, and provider-certified payment QA. |
| Money and accounting | Payments/ledger already existed; stock movements, purchase-order receiving, vendor-bill review, and portable invoice/vendor-bill/ledger CSV exports are connected without provider credentials. Refund and dispute records are modeled without implying provider execution. | Optional QuickBooks OAuth/mapping/replay remains for customers wanting automatic two-way sync; complete refund/dispute provider handling and reconciliation certification. |
| Communications and retention | Canonical inbox and deterministic stop-on-response are implemented; existing lifecycle employees cover missed calls, estimates, nurture, reactivation, reviews, referrals, and CLV. Generic provider webhooks now require replay-resistant HMAC authentication. | Normalize verified Twilio voice/SMS and portal/chat inbound events into the inbox and complete the separate Ferocity provider registration. |
| Workforce and recruiting | Applicant pipeline plus interview, offer, onboarding, training, credential, and compensation foundations are implemented. | Add public careers intake, interview/offer UI depth, payroll sync, and commission calculation certification. |
| Analytics and migration | Existing reports remain; customer CSV dry-run/apply/safe rollback is implemented. | Add role-specific service dashboards and incumbent-specific imports for the remaining record families. |
| Variable provider cost | AI dollar budgets, messaging projected-cost caps, managed-ad prepaid controls, usage charge approval, and atomic storage quotas are implemented locally. | Reconcile estimated costs to provider invoices and certify aggregation/rebilling before any managed usage lane is automatic. |

## Final Competitor Capability Audit

“Complete locally” means the workflow, persisted state, consumer, and UI are
connected in this repository. It does not override a provider or migration gate.

| Expected capability | Ferocity result | Evidence / honest limitation |
| --- | --- | --- |
| CRM, customer history, contacts, locations, equipment | Complete locally | Canonical customer graph, tags, custom fields, exact duplicate detection, audited merge, portal, and operating history. Fuzzy duplicate scoring remains an enhancement. |
| Lead capture and qualification | Complete locally | Public forms, website chat, scoring, consent, source attribution, opportunities, and lifecycle enrollment are connected. |
| Pipeline automation | Complete locally | Stage/event records, qualification, appointments, estimates, jobs, invoices, payments, and stop-on-response behavior feed guarded automation. |
| AI website chat | Complete locally | Uses shared lead, messaging, industry knowledge, AI, and owner-escalation systems. |
| AI phone receptionist | Provider-gated | Call, tool, handoff, appointment, usage, and billing architecture exists. A live phone claim requires an approved number/provider and certified calls. |
| SMS and email conversations | Complete locally; delivery-gated | Shared inbox, provider-independent send engine, consent, suppression, idempotency, projected cost caps, and response stops are connected. Twilio/Resend live certification remains. |
| Missed-call recovery | Complete locally; voice-gated | Customer Lifecycle Manager creates guarded recovery work from call state. Live calls depend on the voice lane. |
| Estimate follow-up and long-term nurturing | Complete locally | Deterministic lifecycle employees create follow-up work and stop when the customer replies or state changes. |
| Database reactivation | Complete locally | Eligible inactive customers become guarded reactivation work with consent and collision controls. |
| Review automation | Complete locally; delivery-gated | Review requests, proof, service-recovery routing, and attribution are connected. Provider delivery requires setup. |
| Referral automation | Complete locally | Trackable referral links create attributed leads and revenue instead of estimating referral value. |
| Customer lifetime-value campaigns | Complete locally | Lifecycle monitoring uses service, invoice, membership, warranty, and response state. Provider delivery remains gated. |
| Appointment booking | Foundation complete | Revenue appointments, public booking routes, canonical service visits, reminders, and secure confirmation/change links exist. Unified real-time technician availability and calendar reconciliation remain. |
| Scheduling and dispatch | Strong native foundation | Day/week/team/unscheduled views, worker eligibility, conflicts, assignments, AI scans, dispatch states, ZIP/city route clustering, directions, and private iCalendar feeds work without provider accounts. Optional road-network optimization and two-way provider calendar edits remain. |
| Mobile field execution | Strong local foundation | Simple workday, canonical visit, scope/history/equipment, forms, signature acknowledgment, proof, receipts, time, mileage, status, completion gates, and offline mutation queue exist. Offline binary attachments and drawn signature storage need certification. |
| Pricebook and estimates | Strong local foundation | Catalog items, regional pricing, packages schema, cost/margin, public options, deposits, acceptance, warnings, takeoffs, and change records exist. Package-builder, tax-jurisdiction, and financing UX remain. |
| Invoicing and payments | Foundation plus existing ledger | Invoices, payments, links, ledgers, collection work, credits/write-offs schema, and provider readiness exist. Stripe/Connect, refunds/disputes, reconciliation, and live-money testing remain release gates. |
| Memberships and recurring service | Complete locally; billing-gated | Programs, benefits, customer plans, due-visit generation, renewal state, and portal visibility are connected. Recurring charge/dunning certification remains. |
| Inventory and procurement | Complete locally | Locations, audited movements, reservations, order lists, receiving, stock updates, vendor bills, and accounting export preparation are connected. Supplier submission remains provider/review gated. |
| Accounting | Keyless export foundation | Invoices, vendor bills, expenses, and ledger records export to portable CSV without provider credentials. Optional QuickBooks OAuth, conflict resolution, and replay remain for businesses that want automatic two-way sync. |
| Customer portal | Strong local foundation | Requests, messages, estimates, appointment visibility, invoices, payment links, equipment, documents, memberships, reviews, referrals, and proof share one link. Self-booking and stronger auth choices remain. |
| Recruiting and workforce | Strong local foundation | Applicants, interviews, offers, onboarding, training, credentials, scheduling eligibility, time, mileage, expenses, reimbursements, payroll exports, and compensation rules exist. Provider payroll and public careers depth remain. |
| Marketing, content, SEO/GEO, backlinks, ads | Strong local foundation | Website import, plans, content, local authority, linkable assets/opportunities, proof, publishing queue, campaign variants, attribution, and guarded ad budgets exist. Ferocity does not promise purchased backlinks or live spend without provider authority. |
| Analytics | Improved locally | Owner, revenue, channel, expense, technician, dispatcher, capacity, membership, warranty, callback, inbox, and pricebook-margin reporting are connected. Deeper service cohorts and callback/warranty quality remain. |
| Industry modules | Complete modular foundation | Roofing v1 is versioned and guarded; the same module/item/tenant-override design can support other trades without hard-coded product forks. |
| Imports and exit safety | Customer path complete | Customer CSV has dry-run, validation, apply, audit, and safe rollback. Remaining incumbent record families still need adapters. |
| Public API and webhooks | Partial, hardened | Stripe, MarketplacePro, Resend, voice, and generic messaging entry points are provider-gated; generic messaging now rejects unsigned, stale, malformed-provider, and malformed-tenant requests. Outbound delivery, API keys/scopes, versioning, rate limits, and developer documentation remain. |
| Enterprise controls | Partial | Tenant isolation, roles, audit/event history, credentials, limits, exports, and multi-workspace foundations exist. SSO, retention/legal hold, backup restore drills, and enterprise multi-location administration remain. |

### Where Ferocity can exceed incumbents

- One AI chief of staff can connect sales, schedule, field evidence, money,
  retention, growth, provider cost, and owner authority instead of forcing the
  owner to inspect separate modules.
- Automations react to business state and customer replies, rather than blindly
  finishing a static sequence.
- Construction risk combines scope, schedule, documents, field proof,
  purchasing, costs, invoices, and changes with evidence.
- The same authority model can move low-risk routine work autonomously while
  reserving legal, safety, payment, contractual, and material-spend decisions
  for the owner.
- Simple Mode can hide system depth from an overwhelmed small contractor
  without discarding the underlying records needed as the company grows.
- Provider ownership and dollar-based controls let Ferocity deliver value
  without creating an uncontrolled COGS trap.

This is now a materially stronger service-business OS foundation, but it is
not honest to call it a complete ServiceTitan replacement until the remaining
provider, routing, accounting, import, scale, and production-certification work
above is finished.
