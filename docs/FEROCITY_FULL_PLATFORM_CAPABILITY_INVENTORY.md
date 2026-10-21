# Ferocity full-platform capability inventory

Date: 2026-10-05

Status: canonical audit scope; not a production-readiness claim.

This inventory describes what Ferocity is intended to be and the capability families already represented by routes, domain services, persisted records, plans, or canonical architecture. A page, schema, model call, or unit test does not prove a capability works. Every item remains `unverified` until the production acceptance matrix records evidence for the intended user, input, durable result, authority boundary, failure behavior, and continuation path.

## Product definition

Ferocity is intended to be the business brain, system of record, permissions layer, workflow engine, orchestration layer, AI workforce, and owner command center for a service business. It should connect the complete lifecycle:

`Customer -> Location -> Asset -> Opportunity -> Estimate -> Work Order -> Visit -> Invoice -> Payment -> Retention/Growth`

Its operating promise is that Ferocity watches the whole business, understands what is happening, safely performs the next authorized useful action, and brings only protected decisions or true exceptions back to a person.

## 1. Ask Ferocity and the AI business operator

- Real conversational question answering about the business and ordinary business topics.
- Diagnosis using relevant tenant-scoped business context, not merely generic advice.
- Minimum necessary clarification about goals, economics, constraints, authority, and missing facts.
- Cross-department planning across customers, work, people, money, communications, and growth.
- Governed execution of authorized internal work.
- Preparation and approval routing for protected external or consequential work.
- Exact result receipts showing what was inspected, prepared, executed, verified, blocked, or failed.
- Direct continuation into the finished record, draft, report, approval, or operating surface.
- Persistent conversation context, corrections, short follow-ups, voice input, and attachments.
- Owner chief-of-staff behavior: surface a few consequential decisions rather than a wall of modules.
- Specialized AI roles: receptionist, dispatcher, estimator, job coordinator, customer care, revenue manager, inventory/procurement manager, recruiting coordinator, growth manager, and owner chief of staff.
- AI authority levels, budgets, provider/model routing, independent review, human review, monitoring, and audit evidence.
- Provider-neutral business actions so approved native or future outside AI workers use Ferocity's controlled operating layer rather than direct database access.

## 2. Business Brain and shared operating context

- Business identity, brands, services, service areas, offers, audiences, goals, rules, voice, proof, and constraints.
- Shared customer, job, schedule, financial, workforce, conversation, provider, and growth context.
- Industry knowledge and versioned industry modules without hard-coded product forks.
- Business memory with provenance, confidence, review state, and expiration/refresh rules.
- Cross-module events connecting actions and outcomes instead of isolated dashboard data.
- Data-quality, attribution-health, anomaly, risk, opportunity, and owner-attention signals.
- Evidence-backed recommendations with reason, confidence, expected value, and next action.

## 3. Workspace, organization, brand, and access management

- Tenant/workspace creation, selection, membership, and separation.
- Multiple businesses, brands, locations, and client workspaces.
- Owner, administrator, office, operator, field, employee, viewer, and specialized role views.
- Invitations, access requests, role changes, permission checks, and revocation.
- Entitlements, plan limits, feature controls, usage controls, and workspace preferences.
- Brand-specific context, provider identities, credentials, and data boundaries.
- Cross-tenant isolation and minimized role-appropriate data access.
- Pro/agency and managed-operator operating models.

## 4. Setup, onboarding, migration, and go-live

- Guided business setup based on the first desired outcome.
- Business profile, service, territory, team, authority, provider, and workflow configuration.
- Website/business-fact import with reviewed normalization.
- Gap scans and recommended setup plans.
- Feature readiness, provider readiness, safety readiness, and go-live checks.
- Dry-run, validation, reconciliation, apply, audit, and rollback-safe imports.
- Customer CSV import foundation and expansion to jobs, estimates, invoices, pricebooks, memberships, assets, documents, and attachments.
- Sample/demo paths that remain clearly separated from real customer data.
- Runbooks, walkthroughs, in-product help, diagnostics, and recoverable setup failures.

## 5. CRM, customers, locations, contacts, and assets

- Canonical customer records and complete service history.
- Multiple contacts, communication preferences, consent, tags, and custom fields.
- Billing and service locations, access instructions, service zones, coordinates, and location history.
- Customer assets/equipment with manufacturer, model, serial number, install date, condition, warranty, and service history.
- Exact-match duplicate detection, owner-confirmed merge, merge audit, and future fuzzy duplicate review.
- Customer touchpoints, activity timeline, documents, conversations, opportunities, jobs, invoices, payments, reviews, referrals, and memberships in one context.
- Customer lifecycle status, lifetime value, satisfaction, recovery, retention, and next-best action.

## 6. Lead capture, qualification, pipeline, and sales

- Public and embedded forms, website chat, calls, messages, referrals, imports, webhooks, ads, and manually entered leads.
- Source, campaign, UTM, referral, call, form, and provider attribution.
- Consent-aware identity resolution and duplicate handling.
- Dynamic qualification questions, scoring, urgency, service fit, geography, value, and routing.
- Pipeline stages, responsible person, SLA, next action, collision protection, and owner escalation.
- Speed-to-lead, missed-opportunity detection, stale-lead recovery, and stop-on-response.
- Opportunity records, expected value, probability, timing, loss reason, and reactivation eligibility.
- Sales conversation intelligence, summaries, objections, lost-opportunity learning, and future coaching scorecards.
- Estimate follow-up, long-term nurture, reactivation, referral, and retention sequences.
- Clear separation of lead quality, sales execution, delivery capacity, and downstream profitability.

## 7. Calls, receptionist, office management, and communications

- AI receptionist for answering, qualification, booking, context preservation, escalation, and approved human transfer.
- Inbound and outbound call lifecycle, transcript, summary, recording/consent state, action extraction, and follow-up.
- Missed-call recovery and callback management.
- Shared inbox across voice, website chat, SMS, email, portal, and social sources.
- Assignment, unread state, SLA, collision protection, summaries, handoffs, and stop-on-response.
- Draft-first and approval-aware customer messaging.
- Ferocity Connect Android business texting with pairing, SIM choice, scheduled/approved sends, inbound replies, STOP/HELP, quiet hours, pacing, and delivery health.
- Hosted SMS/provider lanes with registration, consent, suppression, idempotency, cost controls, delivery receipts, and inbound normalization.
- Customer Gmail/Microsoft read-only mailbox monitoring; sending remains a separately certified capability.
- Notifications through email, push, in-app alerts, and configured escalation paths.
- Provider-certified transfer destination and failure recovery before live receptionist claims.

## 8. Calendar, scheduling, dispatch, routing, and capacity

- Service types with duration, skills, certifications, crew size, territory, and prerequisites.
- Worker availability, working hours, time off, service areas, and capacity.
- Day, week, team, and unscheduled-work views.
- Appointment and visit creation, assignment, reassignment, confirmation, reschedule, cancellation, and no-show handling.
- Dispatch states from unassigned through completed/canceled.
- Conflict detection for overlap, overtime, travel, skill, certification, territory, and capacity.
- AI dispatcher recommendations under workspace authority.
- Customer confirmation, cannot-attend, and change-request links.
- Route stops, itinerary, directions, ZIP/city/radius clustering, and provider-ready optimization.
- Private iCalendar feeds and future reconciled two-way calendar-provider sync.
- Reminder, on-my-way, running-late, and arrival workflows subject to certified delivery providers.

## 9. Field operations and technician experience

- Simple mobile-first daily work list and canonical visit view.
- Customer, location, asset, history, scope, requirements, directions, and contact context.
- Visit status, arrival, pause, completion, cancellation, and exception handling.
- Configurable forms and checklists with required questions and conditional sections.
- Photos, files, measurements, signatures, acknowledgment, and customer-visible outputs.
- Completion gates that prevent incomplete evidence from being presented as finished work.
- Time, mileage, expenses, receipts, materials, proof, and notes tied to the correct visit/job.
- Offline cache, device-local mutation queue, conflict-aware synchronization, and visible sync state.
- Poor-connectivity recovery and eventual offline support for binary attachments, signatures, time, and material mutations.
- Voice-to-field-note, AI daily reports, equipment updates, warranty updates, and next-stop guidance.

## 10. Jobs, projects, work orders, and construction operations

- Work orders representing commercial scope and visits representing schedulable occurrences.
- Job/project creation from leads, estimates, imported work, recurring plans, or internal requests.
- Status, responsibility, scope, schedule, documents, tasks, dependencies, blockers, risks, and history.
- Crew assignments, customer updates, handoffs, change records, and completion requirements.
- Construction-specific job health combining scope, schedule, purchasing, costs, invoices, documents, field proof, and changes.
- Material needs, labor, subcontractors, equipment, receipts, expenses, payments, and margin tied to the work.
- Job-level communication and customer context.
- Warranties, callbacks, service recovery, repeat work, proof generation, and lifecycle outcomes.
- Focused Job Tracker product that can expand into the full Ferocity operating system without migrating records.

## 11. Estimating, takeoffs, pricebook, proposals, and change orders

- Pricebook services, labor, materials, assemblies, equipment, images, regional overrides, and margin rules.
- Good/better/best packages, optional items, discounts, deposits, financing interest, and payment terms.
- Estimates and bids linked to the correct opportunity, customer, location, job, and cost basis.
- Cost, price, gross margin, markup, risk, scope completeness, and exception warnings.
- Measurements/takeoffs with source evidence and review.
- Proposal preview, customer delivery, options, signatures, acceptance, and audit history.
- Change requests/orders with scope, price, schedule, approval, and downstream job/invoice effects.
- Jurisdiction-aware tax rules and provider-safe financing handoff without inventing approval or rates.

## 12. Customer portal and self-service

- One secure customer path for requests, messages, appointments, estimates, options, signatures, deposits, work history, equipment, invoices, payments, receipts, documents, memberships, reviews, referrals, and proof.
- Appointment confirmation, reschedule requests, cancellation, and cannot-attend responses.
- Payment links and receipts subject to provider certification.
- Membership benefits, due service, renewal, pause, and cancellation state.
- Review/referral requests with attribution.
- Future self-booking availability, stronger authentication choices, and customer file uploads.

## 13. Invoicing, payments, collections, cash, and profitability

- Invoices, line items, due dates, status, statements, payment links, and customer history.
- Deposits, partial payments, saved methods where permitted, recurring charges, ACH, refunds, disputes, chargebacks, credits, write-offs, and reconciliation.
- Cash-collection queues, aging, context-preserving reminders, exceptions, and stop conditions.
- Deterministic ledgers and provider/accounting reconciliation.
- Job revenue, direct costs, labor, materials, overhead allocation, collected cash, gross profit, and margin confidence.
- Evidence-backed job-margin, cash-risk, purchasing-risk, invoice-reminder, and owner-attention recommendations.
- Payment/spend authority, approval requirements, idempotency, provider attempts, audit trails, and reversal handling.
- Stripe payment, Connect, payout, refund, dispute, and subscription behavior only after controlled certification.
- Ferocity Earn eligibility, attribution, collected-revenue classification, settlement review, and understandable billing.

## 14. POS, inventory, materials, purchasing, and suppliers

- Point-of-sale catalog, cart/sale, payment state, line items, receipts, returns, and over-return protection.
- Shared pricebook/catalog alignment so POS, estimates, jobs, purchasing, and reporting do not maintain conflicting items.
- Inventory locations, bins, serialized items, vehicle stock, quantities, cost basis, and availability.
- Audited stock movements, transfers, reservations, consumption, returns, adjustments, cycle counts, and receiving.
- Material requirements derived from estimates, jobs, takeoffs, minimum stock, and demand forecasts.
- Reorder points, reorder suggestions, stockout risk, excess/unused-material detection, and location balancing.
- Suppliers/vendors, items, price history, lead time, terms, reliability, preferred-source rules, and alternatives.
- Purchase requests, approval, purchase orders, supplier submission, receiving, partial receiving, mismatch handling, returns, and vendor bills.
- Job/property/unit allocation of purchased materials and costs.
- Portable accounting export and provider-safe queues for approved supplier/accounting actions.
- AI inventory/procurement manager that forecasts needs while protecting spend and owner rules.

## 15. Documents, receipts, statements, expenses, and tax preparation

- Upload/import from images, PDFs, XLS/XLSX, CSV, compatible Sheets exports, email attachments, and supported structured documents.
- Original private file preservation, deduplication, source lineage, page coverage, extraction, normalization, and review.
- Receipts, invoices, bills, statements, warranties, proof, and other business-document types.
- Separate deposits, purchases, refunds, transfers, withdrawals, fees, reimbursements, owner contributions/draws, and unknown transactions.
- Merchant, description, date, amount, city/state/postal code, category, source, confidence, and review state.
- Property/unit/job/customer/vendor matching with ranked uncertain candidates rather than forced assignments.
- Independent-model review plus deterministic arithmetic, balance, page, row, and completeness checks.
- Human confirmation for unresolved financial or tax-sensitive facts.
- Separate printable/downloadable income, expenses, transfers, withdrawals, refunds, unresolved-property, and reconciliation packets.
- Clear tax-review boundaries: Ferocity organizes evidence and uncertainty without guaranteeing deductibility or substituting for a tax professional.
- Accounting-ready exports with durable traceability and double-count prevention.

## 16. Memberships, recurring service, warranty, and retention

- Membership/service agreement programs, benefits, discounts, terms, status, and customer enrollment.
- Renewal, billing state, pause/cancel, churn, and dunning foundations.
- Automated recurring/due visit creation.
- Warranty terms, coverage, equipment linkage, expiration, claims/service context, and callback history.
- Retention risk, repeat-service opportunities, lifecycle outreach, and stop-on-response.
- Customer lifetime value, satisfaction, service recovery, referral, review, and reactivation workflows.

## 17. Workforce, recruiting, labor, payroll-ready records, and safety

- Employee/worker profiles, roles, teams, skills, certifications, expirations, territories, and availability.
- Scheduling eligibility and assignment constraints.
- Time clock, time records, breaks, overtime foundations, mileage, expenses, reimbursements, and approvals.
- Job/visit labor allocation and labor-cost visibility.
- Payroll-export records, compensation-rule foundations, and review queues.
- Recruiting pipeline: applicants, screening, interviews, offers, onboarding, documents, training, credentials, and separation.
- Labor bench/capacity view and staffing recommendations.
- Field safety requirements, checklists, incidents, credentials, and completion blocking where applicable.
- Future certified payroll providers, commissions, prevailing wage, public careers intake, and stronger compensation calculation.

## 18. Growth and revenue operating system

- Business objectives using collected cash, gross profit, unit economics, margin floors, capacity, backlog, CAC, and ROAS limits.
- Reverse revenue planning from desired outcome through opportunity volume, conversion, capacity, spend, collection, and contribution.
- Market intelligence, voice-of-customer signals, ICPs, ideal-job profiles, offers, positioning, and channel strategy.
- Growth opportunities, funnel health, lost opportunities, conversion gaps, capacity constraints, and data-quality repair.
- Closed-loop controller decisions such as expand, hold, constrain, and repair-data.
- Campaigns, experiments, hypotheses, metrics, guardrails, sample thresholds, decisions, and learning.
- Source-to-lead-to-estimate-to-job-to-invoice-to-payment-to-profit attribution.
- Lifecycle audiences, reactivation, referrals, reviews, retention, and customer-value campaigns.
- Weather/event-responsive demand signals and geographic profitability.
- Owner growth briefing and a small number of evidence-backed actions.
- No automatic paid-spend increase without explicit authority and provider controls.

## 19. Marketing, content, creative, media, ads, and distribution

- Marketing profile, audience, brand voice, offer, proof, objective, and channel context.
- Campaign planning, content calendars, briefs, drafts, variants, lineage, approval, and reuse.
- Written content, social posts, emails, SMS drafts, ads, scripts, graphics, UGC, image, and video workflows.
- Creative strategy, concepts, adaptation by destination, fatigue/lifecycle tracking, and performance learning.
- Canonical provider-neutral publishing/distribution queue.
- Destination-specific validation, media adaptation, approval, retries, provider attempts, and durable status.
- Paid media planning, budget limits, prepaid/managed controls, campaign drafts, read-only account/reporting discovery, attribution, and conversion-event queues.
- Organic/community discovery with rules freshness, account-risk controls, legitimate participation, and safe cadence.
- Manual export fallback when provider APIs are unavailable.
- Customer-owned/BYO provider connections where required.
- Explicit separation of prepared, approved, published, active, spent, and measured states.

## 20. Website, SEO, AI-search visibility, and local presence

- Website discovery/import, grading, issue detection, page/content recommendations, and reviewed changes.
- Website/landing-page plans, lead forms, conversion paths, source tracking, and publishing controls.
- Technical/on-page SEO, service/location pages, topics, internal links, schema opportunities, and performance monitoring.
- AI-search/GEO visibility and evidence-backed authoritative content.
- Local business identity, locations, services, hours, categories, citations, consistency, and discovery signals.
- Google Business Profile readiness, content/posts, questions, reviews, and metrics when legitimately connected.
- Local proof, community/local-content opportunities, weather/event relevance, and source-to-revenue measurement.
- Backlink/linkable-asset opportunity research without promising or purchasing illegitimate links.
- Provider truth and manual workflows when Google or another directory cannot be connected.

## 21. Reputation, reviews, proof, referrals, and Authority Engine

- Review requests timed from genuine customer/job outcomes and permitted communication channels.
- Negative-experience/service-recovery routing before inappropriate review solicitation.
- Review monitoring and response preparation where providers permit it.
- Testimonials, case studies, before/after proof, FAQs, social proof, and approved media.
- Completed-job evidence transformed into review, proof, website, content, and campaign drafts.
- Proof bundles and controlled public/share links.
- Referral links, attribution, resulting leads, jobs, revenue, and repeatability.
- Evidence requirements that prevent invented claims, outcomes, customer quotes, or credentials.

## 22. Reporting, analytics, owner attention, and exports

- Today/owner command center showing priority, money moves, blockers, approvals, and meaningful exceptions.
- Customer, pipeline, source, channel, campaign, attribution, revenue, collection, job, margin, purchasing, inventory, expense, technician, dispatcher, capacity, membership, warranty, callback, inbox, and pricebook reporting.
- Complete source coverage and reconciliation rather than sampled or mixed-context reports.
- Role-specific views and minimized sensitive fields.
- Printable reports, CSV/XLSX exports, accounting exports, iCalendar, and controlled data portability.
- Exact data period, workspace, batch, filters, timezone, generation time, source records, and unresolved limitations.
- Report drill-through to underlying customers, jobs, documents, transactions, provider attempts, and decisions.
- Future deeper cohorts, quality benchmarks, multi-location rollups, and enterprise audit exports.

## 23. Workflow automation and AI workforce operations

- Event-driven and scheduled automations across leads, customers, communications, appointments, jobs, invoices, reviews, referrals, retention, and growth.
- Trigger, condition, action, delay, stop condition, authority, provider, cost, retry, and escalation state.
- Deterministic stop/change behavior when the customer replies or business state changes.
- Action queue, approval queue, automation timeline, monitoring, errors, retries, pause, resume, revoke, and kill switch.
- Idempotency and collision protection so repeated jobs do not create duplicate customer-facing effects.
- Business scans and specialist AI workers coordinated through shared records rather than parallel systems.
- Human-readable explanations of what ran, why, evidence used, result, failure, and next action.

## 24. Integrations, providers, webhooks, API, and outside agents

- Provider registry, connection status, OAuth, credentials, capability truth, scopes, expiry, refresh, reconnect, revoke, and audit history.
- Advertising providers including Google, Meta, Microsoft, TikTok, X, Pinterest, Snapchat, Reddit, LinkedIn, Amazon, and OpenAI Ads according to actual access.
- Communications/providers including Resend, Microsoft/Gmail mailbox monitoring, SMS, Ferocity Connect, and voice/Retell or approved alternatives.
- Payments/accounting/calendar/location/media/storage providers behind provider-neutral contracts.
- Signed inbound webhooks with timestamp/replay protection, tenant resolution, validation, and durable processing.
- Outbound delivery with idempotency, rate limits, retries, failures, and reconciliation.
- Event intake from MarketplacePro, 4Bid, owner systems, and generic authenticated sources.
- Future public API with versioning, scoped keys/tokens, rate limits, documentation, and revocation.
- Future MCP/outside-agent connection using stored principals and grants, short-lived credentials, minimized outputs, injection resistance, approval continuation, owner visibility, pause, and revoke.

## 25. Safety, authority, approvals, privacy, and audit

- Explicit authority modes: suggest, prepare/draft, approval-required, and bounded autopilot.
- Separate controls for sending, publishing, spending, charging, paying, refunding, deleting, contractual changes, payroll, legal/compliance, safety, and other consequential work.
- Consent, opt-out, suppression, quiet hours, communication policies, and customer collision prevention.
- Spend, AI, messaging, storage, media, provider, and usage budgets.
- Approval records with exact proposed action, evidence, risk, cost, approver, decision, execution result, and expiry.
- Tenant/role isolation, secret handling, output minimization, sensitive-field protection, and audit events.
- Independent AI review for important work and human confirmation for critical ambiguity.
- Kill switches, provider pause/revoke, rollback where possible, and honest irreversible-action warnings.
- Untrusted customer, document, email, webpage, provider, and tool content treated as data rather than instructions.

## 26. Reliability, observability, support, and recovery

- Health, provider, workflow, background-job, model, queue, storage, database, and deployment monitoring.
- User-visible degraded, failed, partial, stale, disconnected, and retrying states.
- Structured errors, durable failure evidence, alerting, retry policy, dead-letter/attention routing, and support context.
- Release readiness, promise audit, capability ledger, production smoke tests, and real workflow canaries.
- Build-artifact dependency checks and standalone-function certification.
- Backup/restore verification, retention, deletion, legal hold, orphan cleanup, and egress policy.
- Support requests, diagnostics, runbooks, incident history, and recovery without forcing the owner to rediscover context.
- Performance, concurrency, rate limit, scale, and cost testing appropriate to claimed volume.

## 27. Billing, plans, usage, provider costs, and commercial controls

- Starter, Growth, Operator, Calls, Ferocity Connect, Job Tracker, Earn, Pro/Agency, and Managed Operator paths.
- Subscription provisioning, lifecycle, payment failure/recovery, seats, entitlements, and limits.
- AI, messaging, voice, storage, media, advertising-management, payment, and other variable-cost metering.
- Clear distinction between included allowances, Ferocity charges, provider/customer charges, advertising spend, processing fees, and premium services.
- Usage review and approval before uncertain managed charges become customer billing.
- Revenue-based Earn attribution, eligibility, collected-revenue classification, settlement, dispute/review, and upgrade path.
- No hidden paid commitments or automatic activation based merely on available schema/configuration.

## 28. Personal operations, reminders, tasks, and life/business coordination

- Owner tasks, reminders, priorities, paperwork, waiting items, personal/business categories, and due dates.
- Notifications and contextual continuation into the relevant business record.
- Personal/LifeOps connection boundaries that do not contaminate tenant business records or expose private information to the wrong role.
- Ask Ferocity coordination without turning every question into an unnecessary saved task.

## 29. Industry and business-model adaptability

- Service-business foundation for roughly one to ten field workers, with room for larger and multi-location businesses.
- Versioned industry modules, service templates, forms, pricebook items, terminology, workflows, safety requirements, and tenant overrides.
- Roofing/construction depth without limiting Ferocity to contractors.
- Adaptation for other service, appointment, project, property, retail/POS, and recurring-service businesses using the same canonical operating contracts.
- H4R remains a tenant/customer implementation, not a product-wide hard-coded identity or data leak.

## 30. Product experience standard

- Primary owner questions remain simple: what needs attention, what can make money, what is blocked, who needs something, what work must happen, what is owed/paid/profitable, and what should change.
- Primary navigation should center Today, Customers, Schedule, Work, Money, Growth, and Insights, with Ask Ferocity persistently available.
- Advanced controls, integrations, billing, access, diagnostics, and internal machinery should not overwhelm daily work.
- Pages should lead with the current result and next action, keep secondary details collapsible, preserve place/scroll position, and use plain business language.
- Every artifact must be findable, editable when appropriate, printable/downloadable when appropriate, traceable, and clearly separated from test/demo data.
- Mobile, keyboard, accessibility, attachments, retries, interruption, partial success, and recovery are part of the product—not optional polish.

## Acceptance status model

Every capability and representative workflow must receive exactly one evidence-backed status:

1. `production verified`
2. `partially working`
3. `broken`
4. `blocked by provider or owner-only action`

The evidence record must include date, environment/build, workspace, role, input, expected result, actual result, stored output, user-visible result, source traceability, authority behavior, failure/retry behavior, defect references, and retest requirement.

Until that matrix exists and has been executed, this inventory is the audit scope—not a claim that Ferocity currently delivers every item above.
