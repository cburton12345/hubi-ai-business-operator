# Ferocity CTO Gap-To-100 Implementation Plan

This file tracks the practical work needed to move Ferocity from a broad beta platform into a launch-ready AI operating system. It is intentionally focused on proof, not more promises.

## Current Readiness

- Paid beta usefulness: 82/100
- World-class AI operating system readiness: 55/100

## Highest-ROI Work, In Order

1. Make the owner dashboard feel like the real front door.
   - Show what Ferocity is watching.
   - Show what AI handled.
   - Show what needs owner approval.
   - Show what makes money next.
   - Show what is blocked by missing keys, providers, consent, tier limits, or setup.

2. Consolidate fragmented intelligence.
   - Reuse the existing Attention Command aggregator.
   - Avoid duplicate dashboards that say similar things.
   - Route owners from the first screen to the right action.

3. Keep claims honest.
   - Separate live, connected work from draft/review-ready work.
   - Avoid saying live sync, live sending, live calling, live ad publishing, or live video generation is active unless the provider is connected and the workflow is actually executable.

4. Strengthen the closed loop.
   - Lead source -> lead -> follow-up -> estimate -> job -> invoice -> payment -> review -> referral/proof -> marketing -> revenue attribution.
   - Surface missing links in that loop instead of burying them in settings.

5. Make AI feel like an operator, not a chatbot.
   - Use plain owner questions.
   - Produce action plans and queue records.
   - Make approvals, sends, reminders, setup, and routing visible.

6. Move from setup-heavy to outcome-first.
   - Let users start with one lane.
   - Show setup only when needed.
   - Make provider keys optional until a workflow actually requires them.

7. Harden payment and money language.
   - Distinguish invoices, payment tracking, Stripe Checkout, customer-owned Stripe, managed payment facilitation, fees, payouts, refunds, disputes, and reconciliation.
   - Do not imply bank payouts are live unless Stripe Connect/payment facilitation is fully approved and configured.

8. Make employee mode and simple job mode obvious.
   - Jobs, bids, materials, hours, receipts, reimbursements, reminders, itinerary, and worker visibility should be reachable without forcing a user through advanced AI setup.

9. Add proof where features are real.
   - Public pages should sell outcomes.
   - Logged-in pages should show actual workspace state, empty states, and setup paths.

10. Verify before deploy.
    - Typecheck.
    - Lint.
    - Build.
    - Public guard.
    - No Netlify deploy until explicitly approved.

## Work Completed In This Pass

- Started wiring the main `/app` dashboard to the real Attention Command aggregate instead of relying only on separate dashboard cards.
- Added this tracking file so future work stays tied to the CTO audit instead of drifting into new feature sprawl.

## Remaining Launch-Critical Gaps

- Live provider credentials and external approvals still determine which actions can run automatically.
- Premium media generation needs its dedicated provider key and cost controls before claims should say video generation is live.
- Live voice answering needs provider configuration, phone routing, and real-world call QA before being marketed as fully live.
- Managed payments/payouts require Stripe account/Connect/business approval, webhook verification, fee rules, dispute handling, payout reconciliation, and customer-facing terms before promising pass-through payouts.

## Payment Readiness Pass After TikTok

- Verify customer subscriptions to Ferocity use the correct live Stripe account.
- Confirm pricing plans, upgrades, downgrades, cancellations, failed payments, portal access, and webhook delivery.
- Confirm renewals are recurring monthly subscriptions, not one-off checkout sessions.
- Confirm add-ons, usage billing, managed operator services, and markup/fee policies are represented clearly.
- Keep "customers pay Ferocity" separate from "a business's customers pay that business."
- Do not market Ferocity-managed payouts as live until Stripe Connect/facilitation, fee disclosure, disputes, refunds, reconciliation, and payout flow are verified end to end.
