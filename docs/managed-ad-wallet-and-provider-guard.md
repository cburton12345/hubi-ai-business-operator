# Managed Advertising Wallet And Provider Guard

## Purpose

Customer checkout and Ferocity subscription billing remain independent from advertising media balances. A low Microsoft, Google, Meta, TikTok, or Reddit balance must never cause a customer subscription or invoice payment to fail.

Ferocity-managed advertising uses two separate protections:

1. The workspace prepays its own advertising wallet through Stripe.
2. Ferocity verifies that the linked provider funding account can safely support the reservation.

Customer-owned ad accounts remain the preferred path and use the customer's provider billing directly.

## Existing Systems Reused

- Stripe Checkout and the signed Stripe webhook.
- `managed_ad_budget_controls` for tenant wallet, approval, caps, stop-loss, and live enablement.
- `managed_ad_spend_events` for the immutable money ledger.
- `provider_funding_accounts` for Ferocity-paid provider balances, reload settings, payment health, and freshness.
- Provider-independent ad adapters. Business logic does not depend on Microsoft Ads or another provider.

## Payment Flow

1. An owner/admin chooses a provider and prepays at least $25 from `/app/billing`.
2. Stripe hosts card entry. Ferocity never stores card numbers.
3. A verified `checkout.session.completed` or `checkout.session.async_payment_succeeded` event credits the correct tenant/provider wallet exactly once using the Checkout Session ID.
4. A campaign or budget action must call `reserveManagedAdSpend()` before contacting the provider.
5. The reservation is allowed only when approval, customer funds, daily/monthly caps, stop-loss, provider payment health, provider balance freshness, and provider funding capacity all pass.
6. The provider action settles the reservation with actual spend, or releases it when the action fails or is cancelled.
7. Provider spend above the reservation automatically pauses live spend for that tenant/provider.

## Provider Balance Capacity

Provider capacity includes the current verified balance, unexpired promotional credit, and only the remaining configured monthly reload allowance. Open reservations across every tenant sharing that provider account are deducted. A stale balance, failed payment method, depleted account, or missing funding-account link blocks new managed spend.

This lets a small current provider balance coexist with safe auto-reload while preventing unlimited exposure. The platform owner must record a deliberate monthly reload allowance; Ferocity does not invent one.

## Required Adapter Contract

Every live managed-ad adapter must follow this order:

```text
reserveManagedAdSpend
  -> provider create/update action
    -> settleManagedAdSpend(actual provider spend/reference)

provider failure/cancellation
  -> releaseManagedAdSpend
```

No provider adapter may launch or increase a Ferocity-funded campaign by calling only `canUseManagedAdSpend()`. That helper is display/preflight guidance; the atomic reservation is the financial enforcement point.

## Launch State

Migration `154_atomic_managed_ad_wallets.sql` must be applied before this code is deployed. Managed advertising remains off until each provider has:

- a current Ferocity funding-account record;
- a verified payment method and balance snapshot;
- an explicit monthly reload/spend allowance;
- a linked tenant budget control;
- tenant prepaid funds;
- customer approval;
- daily and monthly caps;
- a stop-loss; and
- live spend explicitly enabled.
