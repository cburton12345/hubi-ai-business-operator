# Phase 25: Customer Portal Foundation

Phase 25 adds the first customer-facing portal structure for service businesses.

## What changed

- Added `customer_portal_access` for workspace-scoped customer portal links.
- Added actions to create, rotate, and disable a customer portal link from the customer detail page.
- Added a public `/portal/[token]` route that shows read-only customer profile, shared estimates, jobs, and invoices.
- Added portal link status and last-viewed tracking for internal operators.

## What it does not do yet

- No automatic sending.
- No payment collection.
- No customer login account system.
- No external publishing, SMS, email, Stripe, or calendar integration.

## Safety

Portal links are random tokens, can be disabled, and only expose records that already belong to the matched workspace customer. Draft estimates remain internal until marked as manually sent or otherwise customer-visible.
