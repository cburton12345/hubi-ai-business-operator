# Phase 2: AI Marketing Operator

Phase 2 turns the Phase 1 foundation into a working SaaS-style AI marketing operator for external business workspaces and brands.

## Shipped

- Weekly marketing plan generator for each active brand in a workspace.
- Brand-aware prompt context using business type, services, service areas, target customer, tone, contact info, CTA, offers, landing pages, and SEO keywords.
- Draft generator for:
  - SEO blog posts
  - Landing, city, and service page copy
  - Facebook posts
  - Google Business Profile post drafts
  - Ad headlines and descriptions
  - Review request messages
  - Lead follow-up messages
- Marketing automation settings per brand for low-risk draft creation.
- High-risk approval guardrails for publishing, budget changes, legal-sensitive claims, pricing changes, homepage changes, page deletion, and public review responses.
- Marketing plan, calendar, and review dashboard pages.
- Admin review flow for editing, approving, rejecting, scheduling, marking published, and adding notes.
- Lead intelligence for summaries, urgency, spam detection, service/category suggestions, next action, and manual reply drafts.
- Dashboard reporting for leads by brand/source/campaign, content created this week, pending approvals, AI recommendations, and stale leads.
- User-facing copy now favors "workspace" and "organization" over "tenant."

## Migrations

- `005_phase2_ai_marketing_operator.sql`
  - Adds marketing automation settings.
  - Adds brand landing page and SEO keyword context tables.
  - Adds marketing plans.
  - Adds marketing calendar items.
  - Adds lead intelligence.
  - Adds RLS policies for new workspace-scoped tables.
- `006_phase2_recommendation_metadata.sql`
  - Adds recommendation metadata for Phase 2 generator traceability and safe weekly refresh behavior.

## Main Code Paths

- `src/lib/ai/phase2-marketing-operator.ts`
  - Generates weekly plans, drafts, recommendations, approvals, and calendar items.
- `src/lib/ai/lead-intelligence.ts`
  - Generates lead summaries, next actions, urgency, spam signal, service/category, and reply drafts.
- `src/lib/ai/prompt-context.ts`
  - Expanded to Phase 2 brand-aware context.
- `src/app/app/marketing`
  - Weekly plan generator UI.
- `src/app/app/calendar`
  - Marketing calendar/list UI.
- `src/app/app/review`
  - Admin draft review/edit UI.
- `src/lib/dashboard/get-dashboard-snapshot.ts`
  - Phase 2 reporting metrics.

## Safety Rules

The operator remains draft-only. It does not connect to or send through:

- Google Ads API
- Facebook API
- Google Business Profile API
- Twilio
- Stripe billing
- External publishing

AI-generated content must avoid fake guarantees, legal or medical claims, misleading results, invented testimonials, unverified licensing/insurance claims, fake pricing, and invented brand facts.

## Verified

- Tests passed.
- Typecheck passed.
- Production build passed.
- Migrations applied.
- Live Render deploy is running commit `3ee06d7`.
- Generator smoke produced weekly plans, drafts, recommendations, and calendar items.
- Lead intelligence smoke generated a record for a real lead.

## Next Phase Candidates

1. Add real model-backed generation behind the deterministic Phase 2 generator while keeping the same safety and approval contracts.
2. Add workspace onboarding for external businesses: brand profile, services, service areas, offers, SEO keywords, landing pages, and automation settings.
3. Add proper workspace/user authentication and role-scoped access instead of admin token access.
4. Add content version history, comments, and approval audit trails.
5. Add scheduling views by week/month with filters by workspace, brand, content type, status, and risk.
6. Add export/copy workflows for manual publishing to Facebook, GBP, ads, email, and SMS.
7. Add analytics ingestion placeholders for future Google Ads, Meta, GBP, and website events without connecting those APIs yet.
8. Add a customer-facing workspace dashboard for non-internal users.
