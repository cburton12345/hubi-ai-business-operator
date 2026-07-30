# Provider Funding And Cost Control Center

## Outcome

Ferocity has one owner-only control center for variable provider costs without replacing the existing usage, billing, managed-ad, or provider-adapter systems.

The control center answers four operational questions:

1. What has Ferocity paid this month?
2. What customer usage charges have been recorded?
3. How long should each known provider balance last?
4. Which balance, payment method, reload, promotion, or reconciliation needs attention?

It monitors money. It does not move money, initiate a reload, or change a provider billing account.

## Existing Systems Reused

- `usage_meter_events` remains the provider-neutral cost and customer-charge ledger.
- `spend_limits` remains the tenant/provider/global cap and emergency-pause system.
- Managed voice continues enforcing tenant and platform cost caps, concurrency, duration, and billing health.
- Messaging continues separating customer-owned and Ferocity-managed provider accounts.
- Premium video continues enforcing workspace and platform budgets before submission.
- `managed_ad_budget_controls` remains the prepaid media-budget, reservation, stop-loss, approval, and live-spend control.
- Stripe usage charges and invoice synchronization remain unchanged.

## New Owner-Only Records

Migration `152_provider_funding_and_cost_control.sql` adds:

- `provider_funding_accounts`: provider account, ownership, known balance, promotional credit and expiry, reload configuration, limits, payment health, and sync health.
- `provider_funding_snapshots`: immutable observations of balance and tracked cost at a point in time.
- `provider_cost_reconciliations`: comparison of a provider statement with Ferocity's metered cost.
- `provider_funding_alerts`: current and resolved balance, payment, and sync alerts.

These tables use RLS with no client-facing policies because they contain Ferocity's costs, margins, payment health, and balances. The application route also requires `platform:manage`.

## Managed Versus Customer-Owned Accounts

Ferocity-managed funding accounts count usage only when the meter identifies Ferocity as the party paying the provider, including:

- a positive customer usage charge;
- `ownershipMode = ferocity_managed`;
- `providerCostBilledBy = ferocity`; or
- `managedVoice = true`.

Customer-owned funding accounts may count the tenant's complete provider usage because the customer owns that provider bill.

New metering integrations must write `ownershipMode` and `providerCostBilledBy` into `usage_meter_events.metadata_json`. If one provider has multiple funding accounts in the same scope, the integration must also write a stable funding-account key before automated reconciliation can be considered exact.

## Balance Sources

Use the safest available source:

1. Read-only provider balance API.
2. Signed provider billing webhook.
3. Owner-verified manual snapshot.
4. Inference from tracked usage.

Manual is not a fake integration. It is the supported fallback when a provider does not expose a trustworthy, least-privilege balance endpoint. A manual balance becomes stale after 36 hours so it cannot silently look current forever.

## Forecasts And Alerts

For each provider account Ferocity calculates:

- cash plus unexpired promotional credit;
- provider cost and customer charge for the current month;
- gross margin dollars and percentage;
- average daily provider burn;
- projected provider cost for the month;
- estimated days until the recorded balance is empty; and
- whether the recorded balance is at or below the provider reload trigger.

Alert priority is:

1. payment issue;
2. missing or stale balance;
3. depleted;
4. critical balance or two days of runway;
5. low balance or seven days of runway;
6. watch at fourteen days of runway.

The normal business automation loop evaluates these alerts. Closing an account resolves its active funding alerts.

## Promotions

Promotional balances must include an expiration date when known. Expired promotional money is excluded from available balance and runway calculations.

The Google Cloud welcome credit and Google AI Studio/Gemini prepaid balance are separate. A Cloud promotion must not be counted toward Gemini or Veo unless Google explicitly marks that product as eligible.

## Provider Rollout

Create one platform account for each Ferocity-paid provider:

- Google Veo / Google AI Studio
- Retell
- Twilio or another Ferocity-managed telephony/messaging provider
- OpenAI and other metered AI providers
- storage, email, search, enrichment, and future third-party APIs

Customer-owned provider connections remain tenant-scoped. Exact wallet balance is optional for BYO providers; health and metered usage remain useful even when the provider does not expose balance data.

Managed advertising is shown separately because customer media budgets must never be mixed with Ferocity provider cash.

## Launch Procedure

1. Apply migration 152.
2. Open `/app/provider-costs` as the platform owner.
3. Add the Google Veo account with its verified cash balance, promotional credit eligibility/expiry, $10 reload trigger, $25 reload amount, $100 monthly reload limit, and current payment status.
4. Add Retell and every other Ferocity-paid account.
5. Record a fresh balance snapshot.
6. Reconcile the first provider statement against the usage ledger.
7. Verify the scheduled business automation route is running.
8. Resolve every high-severity funding alert before enabling a provider for customer traffic.

## Deliberate Boundaries

- Ferocity does not store card numbers or bank credentials.
- Ferocity does not auto-reload a provider unless that provider owns and executes the configured reload.
- Ferocity does not expose platform provider cost or margin on customer usage pages.
- Ferocity does not claim an inferred balance is provider-verified.
- Adding a provider remains adapter-based; the usage and funding core do not depend on Twilio, Retell, Google, or another provider.
