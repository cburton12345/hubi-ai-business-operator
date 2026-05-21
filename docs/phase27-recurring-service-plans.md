# Phase 27: Recurring Service Plans

Phase 27 adds recurring service plan tracking for field-service-style businesses.

## What changed

- Added `recurring_service_plans` with workspace-scoped RLS.
- Added customer detail creation and list UI for weekly, monthly, quarterly, annual, and custom plans.
- Added plan entries to the customer timeline.
- Added active recurring plans to the read-only customer portal.

## Product intent

This supports maintenance agreements, repeat service, property care, seasonal checkups, and other recurring work without introducing billing automation too early.

## Safety

- No jobs are auto-created.
- No invoices are auto-created.
- No payments are collected.
- Operators still schedule work manually when a recurring visit is ready.
