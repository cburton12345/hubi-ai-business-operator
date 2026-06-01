# Cross-Project Inspiration Audit

This note compares Ferocity against local MarketplacePro, 4Bid, and GovFlow materials so useful product patterns do not get lost.

## MarketplacePro Patterns

MarketplacePro is strongest as a public discovery and local matching layer.

Useful patterns to keep or borrow:

- ZIP, city, latitude, longitude, radius, and fallback text search for local matching.
- Clear listing lanes: need work done, looking for work, hiring workers.
- Private offers and contact requests instead of exposing personal phone/email publicly.
- Public worker availability intake with private contact details.
- Saved providers / "My Crew" as a lightweight relationship list.
- Follow a poster, follow a category, and job alert subscriptions.
- Support/report issue queue for spam, wrong contact info, listing problems, and account issues.
- Admin-editable public site content.
- Traffic events with UTM source, medium, campaign, path, and referrer.

Ferocity status:

- MarketplacePro adapter tables and endpoints exist.
- Lead source tracking exists.
- Customer proof and review workflows exist.
- Missing or should be deepened: local radius/service-area intelligence, saved provider/crew bench, public/private contact rules, job alert subscriptions, support queue polish, and richer traffic/event reporting.

## 4Bid Patterns

4Bid is strongest as a production transaction platform.

Useful patterns to keep or borrow:

- Real auth boundaries and role guards.
- Realtime event delivery where timing matters.
- Immutable bid/order/payment history.
- Stripe checkout and webhook reconciliation.
- Idempotency around payment success and duplicate webhooks.
- Audit logs for admin actions.
- Rate limiting and strict CORS.
- S3-compatible upload abstraction.
- Upload validation and future virus scanning.
- Production smoke checks and launch checklists.

Ferocity status:

- Private app auth boundary exists.
- Stripe-ready invoice/payment paths exist but keys are not live.
- Audit/activity logs exist.
- Missing or should be deepened: rate limiting, upload storage/provider abstraction for customer proof media, payment idempotency hardening, webhook replay protection, and production smoke scripts that hit public pages plus key API routes.

## GovFlow Patterns

GovFlow is strongest as an intelligence and source-monitoring system.

Useful patterns to keep or borrow:

- Source connectors with run history, success/failure counts, and last status.
- Connector health logs.
- Credential expiration and rotation alerts.
- Fit scoring and difficulty scoring.
- Required document extraction and deadline extraction.
- Attachment review flags.
- Draft outreach and estimating notes.
- Daily report: new, urgent, best-fit opportunities.
- Bid/no-bid workflow states, assignment, reminders, and internal notes.
- Optional MarketplacePro publishing only after review.

Ferocity status:

- AI setup, recommended actions, approvals, and activity timeline exist.
- Go-live/system-health pages exist.
- Missing or should be deepened: source connector run history, credential rotation alerts, daily operator digest, fit/urgency scoring by source, document/attachment review for estimates and contracts, and review-before-publish export queues.

## Recommended Ferocity Backlog

High priority:

- Add local service-area intelligence: ZIP/city/radius, target towns, service boundaries, and distance-aware lead routing.
- Add a provider/crew bench: saved subcontractors, workers, partners, referral sources, and private notes.
- Add alerts/subscriptions: follow a source, service, city, customer, campaign, or MarketplacePro vendor.
- Add connector run history and credential rotation alerts for Resend, Twilio, Stripe, Google, Meta, MarketplacePro, Search Console, and website/CMS connections.
- Add media upload/storage path for customer proof: photos, videos, before/after sets, consent, and future malware/size/type checks.
- Add rate limiting and abuse protections for public forms, proof uploads, signup, health-adjacent public endpoints, and webhooks.

Medium priority:

- Add support/report issue queue for public lead forms, proof pages, demo/contact requests, and customer portals.
- Add daily operator digest: urgent leads, stale estimates, overdue invoices, review opportunities, SEO refreshes, provider issues, and source performance.
- Add stronger payment reconciliation: idempotent Stripe webhook handling, duplicate event detection, payment ledger links, and retry-safe invoice reminders.
- Add source/source-run dashboards: imports, failures, last sync, records created, records skipped, and human review queue.
- Add export/publish queues: website pages, MarketplacePro profile updates, GBP posts, review responses, ad creative, and SEO refreshes all stay review-first.

Lower priority:

- Add realtime updates for conversations, lead assignment, and operator console when team usage grows.
- Add public profile/follow links for customers, brands, crews, and referral partners where it makes sense.
- Add admin-editable public copy for launch pages only if marketing pages need non-developer edits.

## Product Guardrail

Ferocity should not become MarketplacePro, 4Bid, or GovFlow.

The right model is:

- MarketplacePro supplies discovery, local matching, public listings, workers, and lead sources.
- 4Bid supplies lessons for transaction integrity, payments, audit, uploads, and realtime operations.
- GovFlow supplies lessons for intelligence, source monitoring, connector health, scoring, document review, and daily reports.
- Ferocity remains the AI growth and operations layer that turns those signals into follow-up, estimates, jobs, reviews, payments, content, and decisions.
