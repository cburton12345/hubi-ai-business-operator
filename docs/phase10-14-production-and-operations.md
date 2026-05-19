# Phases 10-14 Production And Operations

## Phase 10: Production Hardening

- Added route/action-level permission enforcement for sensitive workspace operations.
- Added structures for workspace settings, brand access rules, form-key rotation audit records, lead scores, assignments, exports, and business workflow configs.
- Kept emergency admin token access available, but normal workspace users now flow through role checks.

## Phase 11: Brand Operations Editors

- Brand profiles now include service, service-area, offer, SEO keyword, and landing-page editors.
- Added public form-key rotation with audit history.
- These structures feed the weekly AI operator so generated work stays brand-aware.

## Phase 12: Lead Management Upgrade

- Lead dashboard now shows score, grade, assignee, and possible duplicate flags.
- Lead detail now supports scoring and assignment.
- Added manual CSV export for selected-workspace leads.
- Export events are logged to the database.

## Phase 13: Business-Type Workflows

- Added configurable workflows for local service, rental, software, marketplace, and lead-generation businesses.
- Workflow rules are editable JSON per brand at `/app/workflows`.
- No external routing, messages, or publishing are automated.

## Phase 14: Customer-Facing SaaS Polish

- Added `/app/settings` for organization profile, onboarding checklist, usage placeholders, plan placeholders, and export policy.
- Billing remains a placeholder; Stripe is not connected.
- UI continues to use "workspace" and "organization" language for customer-facing surfaces.
