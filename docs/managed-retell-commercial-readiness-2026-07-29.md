# Managed Retell commercial readiness — July 29, 2026

## Decision

Ferocity keeps voice provider-independent. Retell is the first managed voice
engine, not a permanent platform dependency. Customer-owned Retell and telephony
credentials remain isolated by workspace and are billed by the customer's
provider. Ferocity-managed Retell usage is metered and rebilled by Ferocity.

## Launch pricing

- Starter: 25 managed voice minutes included.
- Growth: 100 managed voice minutes included.
- Operator: 300 managed voice minutes included.
- Managed Operator: 500 managed voice minutes included.
- Additional managed voice: 59 cents per minute.
- Bring-your-own provider: no Ferocity per-minute voice charge; the provider
  bills the customer directly.
- One managed number may be absorbed into the subscription at launch. Additional
  number pricing should wait until the number-purchase experience exists.

This price protects margin against Retell's variable voice, model, and telephony
costs while remaining easy to explain. A 35-cent-per-minute provider-cost ceiling
pauses only the affected managed workspace for review.

## Safeguards now implemented

- Pre-call checks for workspace, subscription, emergency pause, monthly hard
  minutes, provider-cost cap, customer-charge cap, concurrency, and duration.
- Retell inbound calls use Ferocity's preflight webhook, so an unmanaged call
  cannot bypass limits by directly binding a phone number to an agent.
- Completed calls use a stable call-level idempotency key, preventing
  `call_ended` and `call_analyzed` from double-billing.
- Actual Retell `combined_cost` and customer charge are saved on the usage event
  and receptionist call.
- Included minutes are consumed before overage begins, including calls that
  cross the allowance boundary.
- BYO usage is recorded for visibility but never rebilled by Ferocity.
- Managed overage is aggregated into one monthly Stripe-ready charge instead of
  creating one invoice item per call.
- Disclosed managed overage is auto-approved. Once the billing switch is enabled,
  closed monthly charges sync automatically to the tenant's active Stripe
  subscription.
- A provider-cost spike pauses only that tenant's managed voice account and logs
  an operator event. Other tenants and BYO accounts continue normally.

## Deliberately not activated

- Minute bundles remain planned because there is no complete bundle-purchase
  experience yet. Selling a dead option would create a feature island.
- Automatic Stripe usage sync remains off until
  `FEROCITY_USAGE_BILLING_ENABLED=true` is deliberately set for production.
- Retell cannot place live managed calls until the account has a payment method
  and a configured phone number. Card entry is an account-owner action.

## Remaining account-bound launch steps

1. Add the company card to Retell and enable automatic balance replenishment.
2. Purchase or import the initial managed number.
3. Run Receptionist Setup to create the industry-specific agent and verify the
   inbound preflight route.
4. Place one authorized test call and confirm call cost, transcript, and monthly
   usage aggregation.
5. Enable `FEROCITY_USAGE_BILLING_ENABLED=true` only after the public pricing
   disclosure is approved for launch.
