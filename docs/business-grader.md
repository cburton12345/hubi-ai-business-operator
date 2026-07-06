# Business Grader

## Goal

Business Grader is a primary Ferocity lead-generation channel. A business owner enters a website URL, business name, category, service area, email, and optional Google Business Profile URL. Ferocity returns an instant audit that explains what is working, what is leaking revenue, and what to fix first.

The grader should always provide value before asking for money, then naturally lead into Ferocity setup.

## Current MVP Implementation

- Public entry route: `/business-health-score`
- Legacy alias: `/website-grader`
- Report route: `/business-health-score/report/[token]`
- API route: `/api/website-grader`
- Storage table: `public.website_grader_reports`
- Scoring engine: `src/lib/website-grader/grader.ts`

The MVP stores the scan and report as JSON in `website_grader_reports`. That is enough for fast iteration. A later migration can normalize categories/actions if the report analytics become complex.

## Database Schema

Current table:

- `website_grader_reports`
  - `report_token`
  - `status`
  - `website_url`
  - `final_url`
  - `name`
  - `email`
  - `company_name`
  - `business_type`
  - `score`
  - `grade_label`
  - `extraction_json`
  - `findings_json`
  - `recommended_steps_json`
  - `metadata_json`
  - `ip_address`
  - `user_agent`
  - timestamps

Recommended Phase 2 tables:

- `business_grader_report_categories`
  - `report_id`, `category_key`, `score`, `status`, `evidence_json`
- `business_grader_actions`
  - `report_id`, `rank`, `title`, `impact`, `difficulty`, `estimated_roi`, `time_to_implement`, `ferocity_area`
- `business_grader_competitor_snapshots`
  - `report_id`, `competitor_url`, `score_json`, `notes_json`
- `business_grader_lead_enrichment`
  - `report_id`, `source`, `external_ref`, `data_json`, `confidence`

## Scoring Engine Architecture

Scores are 0-100 and intentionally explainable.

Primary categories:

- Website
- SEO
- Google Business Profile
- Lead Capture
- Reputation
- Automation Readiness

Inputs:

- Public website extraction
- User-supplied service area and category
- Optional Google Business Profile URL
- Owner answers about lead response, follow-up, reviews, payments, operations, hiring, retention, and lead sources

The MVP uses deterministic rules. Later AI should summarize, personalize, and explain the plan, but should not be the only source of scoring truth.

## Report Generation Architecture

1. Validate inputs and consent.
2. Scan website when URL is provided.
3. Extract title, meta description, headings, phones, emails, forms, CTAs, services, service areas, links, proof, and media hints.
4. Score the six primary categories.
5. Generate findings, strengths, weaknesses, missed-revenue estimate, and Top 5 actions.
6. Store report and redirect to public report token.
7. Offer a safe handoff into Ferocity setup.

No messages, SEO pages, ads, payment actions, or publishing actions go live from the grader.

## API Requirements

Current:

- `POST /api/website-grader`
  - website URL
  - Google Business Profile URL
  - email
  - business name
  - category
  - city/state/service area
  - operating answers
  - lead sources
  - consent

Phase 2:

- `POST /api/business-grader/analyze`
- `GET /api/business-grader/report/:token`
- `POST /api/business-grader/report/:token/start-setup`
- Optional enrichment workers for page speed, GBP, SERP, schema, Lighthouse, and competitor comparisons.

## UI Wireframe

Public form:

- Hero: "Find the weak spots costing the business money."
- Inputs: business name, category, service area, website, Google profile, email.
- Quick check: lead response, follow-up, reviews, payments, operations.
- CTA: "Analyze My Business."

Report:

- Overall Business Health Score.
- Six category score cards.
- Estimated revenue being left on the table.
- Strengths.
- Weaknesses.
- Top 5 actions ranked by ROI.
- Ferocity solution CTA.
- Business Autopilot Blueprint handoff.
- Safe setup handoff.

## MVP Implementation Plan

Done / current:

- Public score form.
- Website scan.
- Business Health Score.
- Six primary category scores.
- Missed-revenue estimate.
- Top 5 actions with impact, difficulty, estimated ROI, and time to implement.
- Report storage and public report token.
- CTA into Ferocity setup.

Next:

- Add stronger page speed/mobile/accessibility signals.
- Add structured schema detection.
- Add GBP enrichment when a provider API is connected.
- Add lead scoring for internal sales follow-up.
- Add email notification when a report is generated.
- Add owner dashboard queue for new grader leads.

## Phase 2 Enhancements

- Lighthouse/PageSpeed API.
- Google Business Profile API or safe manual import.
- SERP/local rank snapshot.
- Competitor URL comparison.
- AI narrative summary.
- PDF export.
- Email delivery of the report.
- A/B tested CTAs.
- Lead scoring based on score, category, location, revenue estimate, and intent.
- Industry-specific graders for roofing, HVAC, landscaping, cleaning, rentals, and construction.

## Competitive Analysis

Owner.com focuses heavily on restaurants and promises more traffic, more orders, and more repeat customers through website, SEO, ordering, and follow-up. Ferocity’s wedge is broader local-service operations: leads, follow-up, reviews, SEO, invoices, connected systems, and owner command.

GoHighLevel positions as an AI-powered business operating system for capturing, nurturing, and closing leads. Ferocity should avoid looking like a generic agency CRM by making setup simpler, service-business language clearer, and the owner command layer more opinionated.

Jobber is strong for home/commercial service operations such as quoting, scheduling, invoicing, and payments. Ferocity should integrate with or complement that type of operational workflow, while winning on growth diagnostics, AI setup, review/proof capture, and connected marketing-to-revenue tracking.

Housecall Pro is strong field-service management for trades, including jobs, scheduling, invoicing, payments, and customer communication. Ferocity should not try to clone every dispatch feature first; it should make marketing, follow-up, proof, owner visibility, and setup easier.

ServiceTitan is a deep all-in-one for larger trades businesses, including dispatching, call booking, marketing, reporting, accounting, payments, and financing. Ferocity can win below that complexity by being faster to adopt, clearer for small operators, and better as an AI-guided growth and command layer.

Sources reviewed:

- Owner.com: https://www.owner.com/
- GoHighLevel: https://www.gohighlevel.com/
- Jobber: https://www.getjobber.com/
- Housecall Pro: https://www.housecallpro.com/
- ServiceTitan: https://www.servicetitan.com/
