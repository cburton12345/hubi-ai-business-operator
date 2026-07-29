# Ferocity Launch-To-100 Plan

Goal: make Ferocity launch-safe, honest, useful, and clear enough that a real business owner can sign up, understand the value, connect the basics, and start getting operational help without feeling tricked or buried.

No Netlify deploy until explicitly approved.

## Current Honest Score

- Paid beta / early customer launch before this pass: 82/100
- Fully autonomous AI operating system claim before this pass: 68/100

## What Raises The Score

1. Global feature readiness labels
   - Every major feature must clearly show one of: Live now, Needs connection, Review before action, Higher plan, Coming later.
   - Avoid hidden half-truths.

2. Automatic onboarding from website/grader
   - Business website and Business Grader should feed business facts, services, areas, contact info, workflows, and recommended next steps.
   - Owner should not need to know API/provider language.

3. AI action visibility
   - Show what AI checked, what it prepared, what it handled, what needs approval, and what is blocked.
   - AI should not feel like a decorative dashboard.

4. Payment truth and Stripe readiness
   - Subscriptions are live-path.
   - Manual payment tracking is live.
   - Customer-owned Stripe/Connect payment links must be clearly separated from future Ferocity-managed payouts.

5. Marketing/SEO/reviews truth
   - Ferocity can prepare real marketing systems now.
   - Live publishing/ad spend/customer messages require accounts, permissions, and approvals.
   - No AI slop: drafts must tie to real services, locations, proof, reviews, offers, and source tracking.

6. Provider setup clarity
   - Google, Meta, Reddit, Microsoft, Yahoo, reviews, calendar, CMS, and SMS must show exact state and next step.

7. Mobile/layout polish
   - Public pages and core app pages must not overlap, wrap badly, or feel like a wall of text.

8. Launch verification
   - Run typecheck, lint, tests, public guard, RLS check, provider check, production readiness, build.

## Feature State Definitions

- Live now: usable without external provider keys.
- Needs connection: feature works after an account/key/OAuth/domain is connected.
- Review before action: Ferocity prepares work, but a person approves before public/customer/paid action.
- Higher plan: technically available but gated by plan/usage.
- Coming later: intentionally not live yet.

## Must-Fix Before Serious Public Push

- Add an obvious feature readiness page/card in-app.
- Add readiness/status language to public pricing/features without weakening the pitch.
- Make AI setup from website prominent and usable.
- Make payment collection modes impossible to misunderstand.
- Keep managed marketing/SEO honest: Ferocity can do managed help, but public actions are logged and approved.
- Ensure verification commands pass.

## Completed In This Pass

- Added `/app/feature-readiness` as the plain truth board for live tools, review-required tools, connection-gated tools, higher-plan tools, and later tools.
- Linked the truth board from the logged-in dashboard and app navigation.
- Added automatic website setup from `/app/build-system` so a business can paste its website and let Ferocity create the first safe setup plan.
- Verified provider truth: Resend verified, Stripe subscriptions readable with the live key, push configured, owner events configured, OpenAI reachable.
- Verified production build, public pages, auth redirect, public health, and worker intake smoke route.

## Updated Honest Score After This Pass

- Paid beta / early customer launch: 90/100.
- Fully autonomous AI operating system claim: 76/100.

Ferocity is stronger and more honest now, but a literal 100 requires live OAuth/publishing/payment-provider QA listed below. The platform should not claim full autopilot for ad spend, public posting, live inbox monitoring, review ingestion, or managed payouts until those paths are connected and tested.

## Stretch To Reach 100

- Live OAuth integrations for Google/Meta/Reddit/Microsoft/Yahoo.
- Live CMS publishing adapters.
- Fully tested Stripe Connect customer invoice payments, payouts, refunds, disputes, bank returns, reconciliation, and disclosures.
- Real inbox monitors for Gmail/Outlook.
- Real review platform ingestion.
- Real mobile QA on multiple devices.
- More end-to-end tests for signup to invoice/payment/review.
