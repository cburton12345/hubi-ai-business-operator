# Phase 24: Customer Timeline

Phase 24 turns the customer detail page into a relationship history for service businesses.

## What changed

- Added a chronological customer timeline on customer detail pages.
- Combines existing customer creation, source lead capture, lead events, estimates, jobs, and invoices.
- Links timeline entries back to the source lead, estimate, job, invoice, or customer record.
- Shows current status badges where the record has a workflow state.

## Product intent

External businesses need one place to understand what has happened with a customer before calling, estimating, scheduling, or collecting payment. This phase keeps that view inside the existing workspace and service operations model without adding external integrations.

## Safety

- No customer messages are sent automatically.
- No invoices or estimates are sent automatically.
- No schema migration is required; the timeline is composed from existing workspace-scoped records.
