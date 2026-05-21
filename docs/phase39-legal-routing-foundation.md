# Phase 39: Legal Routing Foundation

Phase 39 adds a manual, approval-gated routing review foundation for legal-sensitive leads.

## What changed

- Added `lead_routing_reviews`.
- Added routing review preparation on legal case intake lead detail pages.
- Operators can record a suggested buyer profile and routing notes.
- Routing review status starts as `needs_approval`.
- Lead events record that routing review was prepared.

## Product intent

Legal lead generation may eventually route qualified leads to buyers or partners. This phase creates the internal review structure without sending anything externally.

## Safety

- No external routing happens automatically.
- Every legal routing review is marked approval-required.
- No buyer API, email, SMS, or webhook integration is connected.
