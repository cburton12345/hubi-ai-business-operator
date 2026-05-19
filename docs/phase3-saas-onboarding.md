# Phase 3: SaaS Workspace Onboarding

Phase 3 adds the first real external-business onboarding path. The goal is to move the product from an internal operator dashboard toward a SaaS product where each customer organization can be set up with its own workspace, brand profile, marketing context, and lead capture.

## Shipped

- Organization workspace onboarding page at `/app/onboarding`.
- One-form setup for:
  - Organization workspace
  - Primary brand
  - Business model
  - Contact info
  - Industry and vertical
  - Primary location
  - Brand description and goal
  - Target customers
  - CTA
  - Tone of voice
  - Services
  - Service areas
  - Offers
  - SEO keywords
  - Landing page ideas
  - Risk profile
  - Approval mode
  - Low-risk automation settings
- Automatic public lead form creation for the new brand.
- Workspace onboarding audit events.
- Organization selector now links to the onboarding flow and shows onboarding status.
- Workspace overview now shows readiness state and can trigger a workspace-specific weekly marketing plan.

## Migration

- `007_phase3_workspace_onboarding.sql`
  - Adds onboarding status fields to workspaces.
  - Adds `workspace_onboarding_events`.
  - Adds RLS policies for onboarding events.

## Main Code Paths

- `src/app/app/onboarding/page.tsx`
  - SaaS onboarding UI.
- `src/app/app/onboarding/actions.ts`
  - Creates or refreshes workspace, brand, services, areas, offers, SEO keywords, landing pages, marketing settings, lead form, and audit events.
- `src/lib/onboarding/workspace-onboarding-schema.ts`
  - Form validation and parsing helpers.
- `src/lib/onboarding/get-workspace-onboarding.ts`
  - Recent workspace onboarding summary.
- `src/app/app/tenant/[tenantSlug]/actions.ts`
  - Workspace-level weekly marketing plan generation.

## Verified

- Tests passed.
- Typecheck passed.
- Production build passed.
- Migration applied.
- Smoke-created an external demo workspace with onboarding completed, one brand, and one form.

## Next Phase

Phase 4 should replace the admin-token-only flow with real authentication and role-scoped workspace access:

- Proper login/account model for external users.
- Workspace owner/admin/operator/viewer roles.
- Workspace switcher.
- Route scoping by selected workspace.
- Remove hardcoded internal workspace assumptions from brand, lead, form, draft, calendar, and review pages.
