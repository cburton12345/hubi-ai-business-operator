# Review request destinations and fallbacks

**Date:** July 31, 2026
**Status:** Implemented and migrated; deployment is intentionally pending.

## Customer experience

Every outbound review request now points to one stable Ferocity feedback URL. That page:

- shows the business's exact configured Google review link when available;
- can show Facebook, Yelp, BBB, industry-directory, and custom review destinations;
- supports workspace-wide defaults and brand-specific overrides;
- always offers private feedback, even when the business has no public listing;
- keeps every public-review option visible to every customer, regardless of rating;
- flags ratings of three or below for internal service recovery without suppressing public links.

This is deliberately not review gating. Ferocity does not ask only satisfied customers for public reviews, does not discourage negative reviews, and does not offer incentives for positive reviews.

## Owner experience

The existing `/app/review` screen now begins with plain-language review destination setup and recent request previews. Owners can paste the direct “Get more reviews” URL from Google Business Profile or configure another supported destination. Existing marketing-content review and export tools remain on the same screen and were not replaced.

## Technical path

1. `review_request_workflows.public_token` identifies the stable public link.
2. The outbound action queue appends `/review/{token}` to SMS and email request messages.
3. `/review/[token]` resolves brand-specific destinations before workspace defaults.
4. Private feedback is stored on the existing review workflow.
5. Low feedback creates a tenant-scoped service-recovery signal in the existing activity trail.

No second messaging, workflow, provider, or compliance system was introduced.

## Remaining release steps

1. Configure and test at least one exact, verified review destination per launch brand. Do not guess a Google listing URL.
2. Deploy only after explicit approval.
3. Send one real test request through each enabled channel and confirm the public link, private feedback, activity event, and service-recovery state.

Migration `155_review_request_destinations_and_feedback.sql` is applied. The transactional smoke test passes for token creation, stable public URL, brand/workspace destination precedence, private feedback, low-rating service recovery, and rollback cleanup.
