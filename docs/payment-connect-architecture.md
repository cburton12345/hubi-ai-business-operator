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

### 3. Ferocity Managed Payments

This is a future Stripe Connect path, not the current live behavior.

- Ferocity acts as the Stripe Connect platform.
- Each business has a connected Stripe account.
- Ferocity can charge a platform/application fee.
- Provider fees, instant payout fees, refund fees, dispute fees, chargeback fees, and bank-return fees should pass through to the business payout unless Ferocity explicitly chooses otherwise in writing.
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

- Manual payment tracking can be available broadly.
- Customer-owned Stripe can be enabled when Stripe keys, webhook verification, and invoice metadata are working.
- Ferocity Managed Payments stays disabled until `STRIPE_CONNECT_CLIENT_ID`, `FEROCITY_MANAGED_PAYMENTS_ENABLED`, connected-account mapping, fee policy, and Connect webhook handling are complete.
- Ferocity should never silently absorb processor fees, payout fees, refund costs, disputes, chargebacks, bank returns, or instant-payout fees.

## First Managed Payments Build

1. Add Stripe Connect settings and platform registration.
2. Create connected account onboarding routes.
3. Store connected accounts in `payment_provider_accounts`.
4. Store fee rules in `payment_fee_policies`.
5. Add account status refresh from Stripe.
6. Update invoice payment link creation to choose:
   - manual tracking
   - customer-owned Stripe
   - Ferocity managed Connect
7. Add application fee calculation from basis points.
8. Update webhooks for Connect account updates, checkout completion, refunds, disputes, and payout issues.
9. Add UI warnings before enabling managed payments.
10. Add terms copy and customer-facing fee disclosure.
