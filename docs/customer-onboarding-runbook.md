# Customer Onboarding Runbook

## New Organization

1. Create the organization from `/app/onboarding`.
2. Add the primary brand profile with real services, service areas, offers, landing pages, and SEO keywords.
3. Confirm tone, CTA, target customers, review strategy, and follow-up strategy.
4. Create at least one workspace user from `/app/access`.
5. Review `/app/settings` and complete the onboarding checklist.
6. Confirm lead forms at `/app/forms`.
7. Open `/app/billing` and confirm the selected plan, usage limits, and Stripe portal status.
8. Confirm `/reset-password` works for the owner email before handing off access.

## Weekly Marketing Operation

1. Generate the weekly AI marketing plan from `/app/marketing`.
2. Review calendar items at `/app/calendar`.
3. Review drafts at `/app/review`.
4. Approve, reject, or request changes.
5. Create manual export packages at `/app/exports`.
6. Publish or send manually outside the platform.

## Lead Operation

1. Review new leads at `/app/leads`.
2. Generate lead intelligence when useful.
3. Score and assign the lead.
4. Add internal notes and update status.
5. Export CSV only when needed.

## Manual-Only Rules

- Do not auto-send customer messages.
- Do not auto-publish content.
- Do not auto-change ad budgets.
- Do not auto-route sensitive leads externally.
- Do not claim pricing, guarantees, licenses, insurance, testimonials, or results unless verified in the brand profile.

## Connected System Checks

1. Add only the systems the customer actually uses from `/app/lifeops-connections`.
2. Keep each system paused until its token, tenant mapping, and first test event are verified.
3. Confirm Owner Command Center shows the test event before calling the integration live.
4. Pause or disconnect systems from Ferocity before removing credentials in the source product.
