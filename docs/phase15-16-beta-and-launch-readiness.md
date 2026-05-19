# Phase 15-16 Beta And Launch Readiness

## Phase 15: Beta Launch Prep

- Seeded a realistic external beta organization: `Beta Roofing Co`.
- Added complete beta brand data: services, service areas, offer, SEO keywords, landing page, lead form, workspace settings, billing placeholder, and readiness checks.
- Added `/app/beta` for beta launch checks.
- Added `npm run beta:smoke` to verify the seeded beta workspace has the required operating data.
- Added workspace isolation unit tests for cross-organization access.

## Phase 16: Billing And Integration Foundations

- Added billing plan and subscription structures.
- Added `/app/billing` to show current plan placeholder and available launch plans.
- Added webhook endpoint and event structures.
- Added `/app/webhooks` to create paused webhook endpoints for future delivery.
- Added public lead API error-event logging.

## Still Manual

- Stripe is not connected.
- Webhooks are not delivered automatically.
- External publishing is not connected.
- Customer messages are not sent automatically.
- Ad budgets are not changed automatically.

## Beta QA Order

1. Log in as a workspace owner/admin.
2. Switch to `Beta Roofing Co`.
3. Check `/app/settings`, `/app/brands`, `/app/forms`, and `/app/beta`.
4. Run a weekly AI marketing plan from `/app/marketing`.
5. Review generated drafts at `/app/review`.
6. Create export packages at `/app/exports`.
7. Submit a test public lead through the beta form.
8. Score and assign the lead.
9. Mark `/app/beta` checks as passed only after manual verification.
