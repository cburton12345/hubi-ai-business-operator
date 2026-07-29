# Ferocity Payment Architecture

Ferocity supports payment operations in layers. The goal is to help businesses get paid faster without making Ferocity the accidental holder of customer funds.

## Payment Modes

### 1. Manual payment tracking

Use this for cash, check, Zelle, Venmo, outside Stripe, ACH outside Ferocity, or any payment the owner records manually.

- Ferocity records the invoice balance, payment, and ledger entry.
- No processor fee is created by Ferocity.
- No payout or dispute handling is performed by Ferocity.

### 2. Customer-owned Stripe

This is the default online payment path.

- The business owns or connects its Stripe account.
- Ferocity creates payment requests/links only when Stripe keys and webhooks are ready.
- Stripe fees, refunds, disputes, chargebacks, bank returns, and payout timing belong to the business account.
- Ferocity tracks invoice status, payment records, ledger entries, reminders, and reports.

### 3. Ferocity Connect Payments

This is the guarded Stripe Connect path.

- Ferocity acts as the software platform while the connected service business remains merchant of record.
- Each business has a Stripe Accounts v2 connected account with the full Stripe Dashboard.
- Stripe is configured as the fees collector and losses collector.
- Ferocity can charge a platform/application fee.
- Direct charges place the customer payment on the connected account. Stripe collects processing fees and carries losses according to the account responsibilities configured during onboarding.
- No customer should be placed on this mode until onboarding, account status checks, payout readiness, webhook handling, dispute/refund handling, and terms are complete.

## Recommended Funds Flow

Default:

- Use customer-owned Stripe/direct charge style whenever practical.
- This keeps the business closest to its own processor fees, refunds, and chargebacks.

Managed:

- Use Stripe Connect with connected accounts.
- Use application fees only after the connected account is onboarded and fees are disclosed.
- Do not run all customer payments through one normal Ferocity Stripe account and manually pay businesses later.

## Launch Rules

- Ferocity's live Stripe platform account was verified on 2026-07-28: charges enabled, payouts enabled, details submitted, and no current or past-due requirements.
- The Connect Platform Agreement and direct seller-payment integration choices are confirmed.
- Manual payment tracking can be available broadly.
- Customer-owned Stripe can be enabled when Stripe keys, webhook verification, and invoice metadata are working.
- Ferocity Connect Payments stays disabled until the first controlled connected-account onboarding and payment/refund test passes. The platform, fee-policy, mapping, and webhook foundations are present.
- The Stripe platform identity check and live webhook destinations are complete.
- The v2 destination posts thin events to `/api/integrations/stripe-connect/webhook` and uses its own `STRIPE_V2_WEBHOOK_SECRET`.
- A separate connected-account snapshot destination posts direct-charge payment events to `/api/integrations/stripe/webhook` and uses `STRIPE_CONNECT_WEBHOOK_SECRET`.
- Accounts v2 uses the preview API version in `STRIPE_V2_VERSION`; review and deliberately upgrade this value when Stripe publishes a newer compatible version.
- Existing legacy v1/Express account records are not silently reused. They must be deliberately reconnected or migrated to avoid changing funds-flow responsibilities without review.
- Ferocity should never silently absorb processor fees, payout fees, refund costs, disputes, chargebacks, bank returns, or instant-payout fees.

## First Managed Payments Build

1. ~~Complete the Stripe platform identity check.~~ Complete.
2. ~~Confirm the platform integration choices in live mode.~~ Complete.
3. ~~Configure and verify the Accounts v2 requirement Event Destination.~~ Complete; a live signed Stripe ping was verified through the production endpoint and webhook ledger.
4. Run one full-dashboard connected-account onboarding in test mode.
5. ~~Store connected accounts in `payment_provider_accounts`.~~ Complete.
6. ~~Store fee rules in `payment_fee_policies`.~~ Complete.
7. ~~Add account status refresh from Stripe.~~ Complete.
8. ~~Update invoice payment link creation to choose:~~ Complete.
   - manual tracking
   - customer-owned Stripe
   - Ferocity managed Connect
9. ~~Add application fee calculation from basis points.~~ Complete.
10. Verify account requirements, checkout completion, refund, dispute, and payout-issue handling during the controlled connected-account pilot. Routes and event subscriptions are in place.
11. ~~Add UI warnings before enabling managed payments.~~ Complete.
12. Add final legal terms and customer-facing fee disclosure for any Ferocity application fee.
13. Enable `FEROCITY_MANAGED_PAYMENTS_ENABLED` only after the above passes in test and live smoke checks.

## Production Verification — July 28, 2026

- Production deploy `6a691c8fd6f1e9b49a3f67e5` is live at `https://ferocity.live`.
- The Accounts v2 thin-event destination is enabled for connected-account requirement, identity, merchant-configuration, capability-status, update, and closure events.
- Stripe's real signed destination ping reached `/api/integrations/stripe-connect/webhook` and was recorded as verified and processed.
- July 29 audit correction: the existing snapshot endpoints were platform-scoped, not connected-account-scoped. A dedicated `connect=true` endpoint was created for connected-account Checkout completion/failure/expiry, payment failures, refunds, disputes, account updates, and payout failures, and its secret was staged for the next deploy.
- Both production webhook routes reject unsigned requests with HTTP 400.
- Live subscription readiness passed for all five configured prices; a live Checkout Session was created and expired without payment.
- `FEROCITY_MANAGED_PAYMENTS_ENABLED=false` was verified after the final production deploy and remains off until the controlled connected-account onboarding, payment, refund, and disclosure test is complete.

## July 29 payment hardening

- Invoice and estimate-deposit Checkout now require a connected tenant account with both card charging and bank payouts active.
- Ferocity no longer silently falls back to collecting tenant customer money on the platform Stripe balance.
- Checkout Sessions are direct charges scoped with the connected account header.
- Checkout and PaymentIntent metadata both carry the Ferocity tenant, invoice, customer, payment-link, mode, and fee identifiers.
- Webhook reconciliation requires the signed event account, metadata account, payment link, invoice, customer, tenant, and active provider-account mapping to agree.
- Delayed payment methods are not marked paid at initial Checkout completion; Ferocity waits for a paid status or the asynchronous success event.
- Failed webhook processing is recorded as failed and returns a retryable error instead of becoming stuck in a processing state.
