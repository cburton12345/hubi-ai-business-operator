# Ferocity Public Site Positioning and Consolidation Audit

Date: 2026-09-25
Status: local implementation and consolidation recommendation; no production deploy in this pass

## Executive conclusion

Ferocity should publicly present one coherent product: the AI operating system for running and growing a business. The site needs enough visible breadth to be impressive, but it should sell outcomes and areas of responsibility—not disclose internal prompts, scoring, orchestration, agent recipes, provider adapters, or workflow implementation.

The current site has strong material, but too many public routes describe overlapping slices of the same system. The safest immediate move is to simplify primary navigation and strengthen the homepage breadth. Existing routes should remain intact until redirects, search value, inbound links, and campaign use are verified.

## 1. Current public route inventory

### Canonical product and conversion pages

- `/` — primary product story
- `/pricing` — monthly plans, Ferocity Earn, usage qualifications
- `/start` — signup/request flow
- `/ask-ferocity` — public diagnostic and sales conversation
- `/ferocity-connect` — differentiated Android connection product
- `/integrations` — customer-facing connection overview
- `/about`, `/support`, `/status` — company and customer trust
- legal/compliance routes — privacy, terms, acceptable use, SMS consent/terms, DPA, subprocessors, contact/compliance

### Overlapping product-explanation pages

- `/features`
- `/platforms`
- `/automations`
- `/demo`
- `/demo/tour`
- `/demo/acme-roofing`

### Targeted acquisition or diagnostic pages

- `/growth-system`
- `/business-health-score`
- `/free-business-audit`
- `/website-grader`
- `/connect-website`
- hosted growth/industry pages

### Functional public entry points

- login, password recovery, invites, customer portal links, employee/field links, public forms, conversations, estimates, payments, and other tokenized experiences

These functional entry points should not be treated as marketing pages or merged merely to reduce the public route count.

## 2. Recommended route classification

### A — Keep as primary public pages

- `/`
- `/pricing`
- `/start`
- `/ask-ferocity` (also embedded/opened from homepage)
- `/ferocity-connect`
- `/integrations`
- trust, support, status, and legal pages

### B — Keep as targeted acquisition pages when they have distinct intent

- `/growth-system`
- `/business-health-score`
- `/free-business-audit`
- `/website-grader`
- industry and campaign landing pages

Each should target a real audience/search intent and lead back to the same Ferocity product—not appear to be a separate product.

### C — Keep behind authentication or direct-link context

- provider setup details
- feature-readiness mechanics
- configuration and installation instructions
- internal execution/status dashboards
- detailed connection requirements

### D — Merge into homepage or pricing story, then redirect after verification

- `/features` → homepage product breadth
- `/automations` → homepage operating/control story
- `/platforms` → pricing/ways-to-start story unless it is repurposed for genuinely separate Ferocity products such as H4R or BidOps
- duplicate demo routes → one credible “see it work” experience

### E — Remove only after link and search review

- thin duplicate pages with no unique search, campaign, customer, or support value
- internal-language pages accidentally exposed as marketing

No route is deleted in this pass.

## 3. Proprietary-detail risk

Public pages may safely explain:

- the outcomes Ferocity pursues
- the business areas it coordinates
- customer-visible controls, approvals, reporting, and traceability
- connection availability and honest prerequisites
- pricing, allowances, and separate provider costs

Public pages should not explain:

- prompt libraries or agent instructions
- scoring formulas or decision thresholds
- provider adapter internals
- orchestration topology
- data-model/table design
- retry logic, automation recipes, or proprietary execution sequences
- exact internal learning/evaluation methods

The detailed Features and Integrations pages deserve a later copy pass because portions currently read more like implementation inventory than buyer-facing explanation.

## 4. Homepage breadth requirement

The homepage should visibly cover:

- customers, leads, sales, estimates, and follow-up
- calls, chat, text, email, appointments, and human handoff
- projects, jobs, tasks, dispatch, documents, field updates, and purchasing
- employee scheduling, hour tracking, crew coordination, availability, credentials, and payroll-ready records
- receipts, expenses, job costing, invoices, payments, collections, tax-ready records, and warranties
- reviews, referrals, reputation, reactivation, and repeat business
- campaigns, content, search, social, images, video, and growth
- owner attention, approvals, reporting, monitoring, and shared business context

The marketing story may name the visible breadth—local presence, SEO, AI-search
visibility, content, UGC, video, voice, SMS, organic publishing, paid media,
reviews, referrals, and reactivation—and may truthfully describe “dozens of
coordinated growth plays.” It should not publish the internal playbooks,
prioritization rules, scoring, attribution logic, prompts, or learning methods.

Tax language must remain “tax-ready records” rather than tax preparation or professional tax advice. Payroll language must remain “payroll-ready” unless a certified payroll provider is actually connected.

## 5. Current pricing truth

Current public definitions in code:

- Ferocity Connect: `$29/month`; additional Android device `$10/month`
- Ferocity Calls: `$49/month + $0.25 per completed voice minute`
- Job Tracker: `$39/month`
- Starter: `$79/month`
- Growth: `$199/month`
- Operator: `$399/month`
- Ferocity Earn: `$0/month base`

Current included managed voice allowances:

- Calls: 0 minutes
- Starter: 25 minutes
- Growth: 100 minutes
- Operator: 300 minutes
- Additional managed voice: `$0.25 per completed minute`

Current hosted SMS allowances:

- Starter: 100 segments
- Growth: 300 segments
- Operator: 1,000 segments
- Additional hosted SMS: `$0.04 per segment`
- Connect and bring-your-own routes: no Ferocity per-message charge, though carrier/provider costs may still exist outside Ferocity

## 6. Ferocity Earn truth

- Customer-originated, Ferocity-managed eligible collected revenue: `0.9%`
- Ferocity-originated eligible collected revenue: `6%`
- The rates do not stack
- Fees apply to eligible revenue actually collected, not leads, estimates, signed contracts, completed work, or unpaid invoices
- Attribution is stored with classification, reason, locked rate, source, and timestamp
- Disputes, corrections, refunds, chargebacks, and reversals have ledger support
- Earn entitlements currently provision the full Operator feature matrix

## 7. Provider-cost rule

The default rule is that provider usage, payment processing, advertising spend, phone/SMS/voice usage, premium media generation, and other third-party costs remain separate unless a written, explicit, bounded sponsorship says otherwise.

The current implementation supports Earn provider-cost sponsorship records. Sponsorship must remain exceptional, explicit, time-bounded or capped, and visible. A one-off sponsored customer must not silently change the default public offer.

## 8. Contradictions and risks to resolve later

- “All-inclusive” language can conflict with separate provider usage and ad spend.
- “Everything is unlimited” should never be used where allowances, rate limits, or third-party charges exist.
- Detailed plan feature inventories can make Ferocity look like a bundle of tools instead of one operating system.
- The current `/platforms` page uses “platform” for plan-like starting products, while the broader Ferocity portfolio may use “platform” for separate products such as H4R or BidOps.
- “Tax” must not imply tax filing/advice; “payroll” must not imply payroll processing unless connected and supported.
- Connector availability must distinguish customer connection support, Ferocity developer approval, account verification, and genuinely live execution.

## 9. Redirect and SEO plan

Before redirecting any route:

1. inspect search traffic and inbound links;
2. identify paid/organic campaigns using it;
3. preserve useful copy on the destination;
4. add a permanent redirect to the nearest relevant section;
5. remove the old URL from the sitemap;
6. verify canonical tags and structured data;
7. test direct links and conversion tracking.

Recommended eventual destinations:

- `/features` → `/#capability-title`
- `/automations` → homepage operating-loop section
- `/platforms` → `/pricing` unless repurposed for the true product portfolio
- duplicate demo routes → the strongest single demo route

## 10. Proposed primary information architecture

Primary navigation:

- Product
- Earn
- Connect
- Integrations
- Pricing
- Sign in
- Start Ferocity

Homepage sequence:

1. Ferocity is the operating system, not another AI agency/tool.
2. Show what it notices, coordinates, advances, and escalates.
3. Show broad business coverage without implementation detail.
4. Show shared context across departments and the customer lifecycle.
5. Show human control and approval modes.
6. Show one credible demo/proof experience.
7. Offer the public Ask Ferocity diagnostic.
8. Route to Earn, monthly pricing, or signup.

## 11. Proposed pricing structure

- Lead with the choice: fixed monthly plan or pay-on-results Earn.
- Keep exact rates and separate-cost qualifications near the decision.
- Show outcomes and fit first; place exhaustive feature comparisons lower or behind an expandable disclosure.
- Avoid framing minutes or SMS segments as the product’s main value.
- Keep Connect and Calls available as focused entry paths without making the company look like a telephony reseller.

## 12. Backend/schema impact

No schema change is needed for the safe public-site positioning work in this pass.

Existing implementation already contains:

- plan pricing and allowances
- Earn enrollment, attribution, ledger, settlement, dispute, and sponsorship support
- provider-cost and usage records
- editable public-copy slots
- customer-facing connector state

Any future pricing-model change, percentage change, inclusion rule, or attribution definition must be handled as a billing migration with versioned terms—not as a copy-only edit.

## 13. Safe changes implemented in this pass

- Ask Ferocity prospects now enter a Ferocity-owned, consent-aware self-growth sequence instead of becoming a manual owner chase task. The sequence waits until the live web conversation has gone quiet, stops when the prospect replies, respects workspace send authority and provider health, and reports progress without interrupting the owner unless a protected decision or person is required.
- The existing AI Growth Department is now part of the production business-automation loop instead of being limited to a manual Growth-page action. Once per day for each entitled workspace—including Ferocity itself—it runs shared growth intelligence, the closed-loop revenue controller, opportunity execution/preparation, and organic-content learning. Publishing and spend remain separately authorized.
- A measurable customer activation/retention loop now records daily lifecycle stage, first-value evidence, activation and health scores, inactivity, churn risk, and the next useful recovery action. At-risk customers are led back through Ferocity Chat instead of being abandoned after signup or confronted with another dashboard.

- Simplified primary navigation around Product, Earn, Connect, Integrations, and Pricing.
- Expanded homepage breadth to include workforce, employee hours, crew coordination, receipts, expenses, job costing, tax-ready records, payroll-ready records, and warranties.
- Replaced the homepage's static Ask Ferocity preview with the real interactive diagnostic chat; retained the floating launcher on other public pages instead of duplicating two chat sessions on the homepage.
- Routed the public diagnostic to the advanced AI tier, instructed it to answer direct questions instead of repeating intake language, and made it deliver a useful recommendation plus a natural conversion path after roughly two meaningful exchanges.
- Made consented Ask Ferocity contacts high-priority owner follow-up leads, preserved recent diagnostic context with the lead, and routed them into the owner attention/push-notification path rather than leaving them as passive chat records.
- Kept language outcome-oriented and removed the vague “that is still not everything” close.
- Preserved all existing routes and underlying functionality.

## 14. Deferred changes requiring deliberate review

- actual redirects and route deletion
- sitemap consolidation
- detailed Features and Integrations copy reduction
- pricing-page information hierarchy reduction
- whether `/platforms` becomes the portfolio page for H4R, BidOps, and other distinct products
- final public-copy edits stored in the database rather than code defaults
- any billing, allowance, or Earn-rate change
