-- New-sale catalog prices for the September 2026 commercial reset.
-- Existing Stripe subscriptions and billing subscription rows are deliberately
-- left untouched; this updates only the catalog used for future purchases.
update public.billing_plans
set monthly_price_cents = prices.monthly_price_cents,
    active = true,
    metadata_json = public.billing_plans.metadata_json || jsonb_build_object(
      'commercialResetAt', '2026-09-26',
      'existingSubscriptionsPreserved', true
    )
from (values
  ('starter', 14900),
  ('growth', 34900),
  ('operator', 69900)
) as prices(plan_key, monthly_price_cents)
where public.billing_plans.plan_key = prices.plan_key;
