# Ferocity Subscription Billing — Production Certification

Status: live and ready for the first paying subscriber on 2026-08-16.

## Customer purchase path

- Ferocity uses Stripe-hosted Checkout in subscription mode.
- Live monthly prices are configured and readable for Job Tracker ($39), Ferocity Calls ($49 plus voice usage), Starter ($79), Growth ($199), and Operator ($399).
- Public checkout requires a valid email, company name, and affirmative contact consent.
- Checkout metadata ties the purchase to its access request, plan, company, buyer, and eventual workspace.
- A verified paid Checkout webhook provisions or upgrades the workspace, creates an owner invitation when needed, applies the plan entitlements, and sends the activation email.
- Repeated subscription and webhook events are idempotent.
- A live production Checkout session was created through the public Ferocity route and safely expired without payment.

## Recurring billing and recovery

- Stripe subscription created, updated, and deleted events synchronize Ferocity's billing state and plan entitlements.
- Renewal success (`invoice.paid`) restores the subscription to active.
- Payment failure, required authentication, and invoice-finalization failure set the subscription to `past_due`.
- Past-due customers keep access during recovery and receive an owner event, in-app/push notification when enabled, and transactional email with a direct Billing link.
- Cancellation disables plan-provisioned entitlements. Cancellation through the portal occurs at period end.
- Failed or incomplete subscriptions are never mislabeled as trials.

## Customer self-service

- The default live Stripe Billing Portal is active.
- Customers can update payment methods, review invoice history, and update email, name, phone, address, and tax information.
- Customers can cancel at period end and provide a cancellation reason.
- Plan upgrades remain inside Ferocity so Stripe price changes cannot bypass Ferocity entitlement updates.
- A live portal session was created for a temporary certification customer; the temporary customer was deleted immediately afterward.

## Webhook separation and verification

- One canonical platform endpoint handles Ferocity subscriptions, renewals, Earn settlement events, refunds, disputes, payouts, and transfers.
- One separate canonical Connect endpoint handles connected-business payments and account events.
- The four obsolete duplicate endpoints are disabled.
- Stripe delivered a real signed Checkout expiration event; Ferocity stored it with verified signature and processed status.
- A separately signed Connect certification event was accepted and processed after the Connect secret was activated.
- Invalid Stripe signatures return HTTP 400 while the health endpoint and homepage remain available.

## Final verification

- 106 test files and 378 tests passed.
- Type checking, lint, and the production build passed.
- Public customer-path smoke, launch-route smoke, Stripe Connect readiness, and provider-failure isolation passed against `https://ferocity.live`.
- Production deploy: `6a82936811767fe6da35f81d`.

No real customer was charged during certification. The first real purchase will be the final financial transaction proof, but no additional build or configuration is required for that customer to subscribe.
