# Authority Engine Implementation Plan

## Architecture Audit

Ferocity already has the core systems Authority Engine should orchestrate:

- Jobs and customers: `service_jobs`, `customers`, estimates, invoices, and job status live in Service Ops.
- Customer proof and UGC: `ugc_capture_requests`, `ugc_submissions`, `ugc_assets`, and `ugc_content_outputs` already handle proof, consent, assets, and proof-to-content drafts.
- Reviews: `review_request_workflows` already supports review requests after completed work.
- Marketing OS: `marketing_os_business_profiles`, `content_studio_campaigns`, `content_studio_outputs`, media assets, graphics, video jobs, ad kits, and platform playbooks already prepare marketing work.
- Publishing: `ai_drafts`, `content_quality_reviews`, `publishing_queue`, and `review_first_export_queue` already keep website/social/GBP/email work review-first.
- Website and SEO: Website connector, hosted growth pages, SEO autopilot, grader, and Growth Calendar already exist.
- AI Workforce: AI commands and recurring workflows exist as the right place to run safe Authority tasks later.
- Integrations: Provider lanes already distinguish customer-owned vs Ferocity-managed publishing, GBP, ad, email, and video capabilities.
- Analytics: growth attribution, revenue growth, reports, and owner events already provide performance inputs.

## Reuse

Authority Engine should reuse:

- `service_jobs` as the source of completed real work.
- `ugc_*` tables for proof, photos, videos, testimonials, and consent.
- `ai_drafts` for review-ready case studies, FAQs, blogs, posts, schema notes, and internal training notes.
- `review_request_workflows` for review requests.
- `publishing_queue` and `review_first_export_queue` for approved external actions.
- `marketing_video_jobs` for video scripts and future rendered media.
- Provider lanes and service gates for live publishing/spend permissions.

## Extend

Authority Engine needs a thin coordination layer:

- Authority score snapshots and explanations.
- Authority events/work items generated from completed jobs and other signals.
- Content gaps and website recommendations.
- Brand mentions and community opportunities.
- Project knowledge articles that summarize real jobs for future AI reuse.
- Authority reports for trend and ROI summaries.

## Never Duplicate

Do not duplicate:

- CRM records.
- Jobs/customers/invoices.
- Proof/media storage.
- Review request workflows.
- Marketing campaigns/content outputs.
- Publishing queues.
- AI provider calls.
- Provider credentials or integration state.

## Phase 1 Build

- Add Authority Engine schema for score, events, gaps, mentions, community opportunities, website recommendations, knowledge articles, reports, and content bundle tracking.
- Add `/app/authority` dashboard.
- Add Authority Manager as an AI Workforce agent row/workflow.
- Add safe completed-job processing action:
  - creates authority event records
  - creates a proof request when possible
  - creates review request workflow
  - creates review-ready drafts: case study, FAQ, GBP post, Facebook post, blog outline, service/location improvement, video script, internal training note
  - creates publishing queue records for appropriate drafts
  - creates project knowledge article
- Keep all outputs draft/review-required.

## Phase 2 Build

- Community discovery records and response drafts.
- Brand mention monitoring records.
- Content gap engine from leads, estimates, conversations, searches, and customer questions.
- Website recommendations from connected website and content inventory.
- AI Workforce scheduled Authority Manager scan.

## Phase 3 Build

- Video production pipeline and provider handoff.
- Competitor insights.
- ROI reports.
- Additional provider integrations.

## Product Rule

Authority is evidence. Authority Engine must never invent projects, customers, reviews, credentials, prices, statistics, outcomes, or platform activity.
