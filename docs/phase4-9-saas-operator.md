# Phases 4-9 SaaS Operator Build

## Phase 4: Workspace Authentication And Scope

- Added app sessions, password credentials, and workspace invites.
- Added workspace email/password login while preserving the emergency admin token path.
- Added selected-workspace resolution and a workspace switcher.
- Scoped dashboard, leads, brands, forms, queues, approvals, recommendations, marketing actions, drafts, and tasks to the selected workspace.
- Added workspace user creation for owner, admin, operator, and viewer roles.

## Phase 5: AI Provider Readiness

- Added `ai_provider_settings` and `ai_generation_runs`.
- Added an AI provider wrapper that uses OpenAI when `OPENAI_API_KEY` is configured.
- When credentials are missing or a provider response is invalid, the platform records fallback usage and uses the deterministic brand-aware generator.
- Weekly plans now record AI generation runs per brand.

## Phase 6: Review Versioning And Audit

- Added content versions, content comments, and approval audit events.
- Saving a draft review now creates a version record, optional reviewer note, and audit event.
- Review remains manual. External publishing and message sending are not connected.

## Phase 7: Manual Export Packages

- Added content export packages for copy, SEO briefs, ad copy, social posts, review requests, and follow-ups.
- Added `/app/exports` to create manual export packages from generated drafts.
- Export checklists remind operators to verify claims, pricing, licensing, offers, and manual publishing rules.

## Phase 8: Reporting

- Added analytics event and campaign attribution-rule structures.
- Added `/app/reports` with lead reporting, content metrics, AI run metrics, fallback counts, export counts, and analytics event visibility.

## Phase 9: Integration Readiness

- Added integration connection and integration job structures.
- Added `/app/integrations` with prepared connection records for Google Ads, Facebook / Meta, Google Business Profile, Twilio, Stripe, and external publishing.
- No external APIs are connected in this phase.

## Deployment Note

Render now uses `npm run start:render`, which runs the idempotent migration runner before `next start`. This lets safe migrations apply against Render's configured `DATABASE_URL` during deploy without storing database secrets in the repository.
