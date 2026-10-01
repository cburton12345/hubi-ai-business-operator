-- Keep persisted plan prices and voice entitlements aligned with the public
-- checkout offer. This is deliberately additive and preserves workspace-level
-- authority, consent, provider, and spend controls.

update public.billing_plans
set monthly_price_cents = prices.monthly_price_cents,
    active = true,
    metadata_json = public.billing_plans.metadata_json || jsonb_build_object(
      'pricingReconciledAt', '2026-09-06',
      'publicPricingSource', 'src/lib/billing/public-plans.ts'
    )
from (values
  ('ferocity_connect', 2900),
  ('job_tracker', 3900),
  ('calls', 4900),
  ('starter', 7900),
  ('growth', 19900),
  ('operator', 39900)
) as prices(plan_key, monthly_price_cents)
where public.billing_plans.plan_key = prices.plan_key;

insert into public.plan_feature_matrix (
  plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json
)
values
  ('starter', 'voice_ai', 'Managed AI phone service', true, '25 managed minutes included; then 25 cents per completed minute', 208,
   '{"managedVoice":true,"byoSupported":true,"pricingReviewedAt":"2026-09-06"}'::jsonb),
  ('growth', 'voice_ai', 'Managed AI phone service', true, '100 managed minutes included; then 25 cents per completed minute', 208,
   '{"managedVoice":true,"byoSupported":true,"pricingReviewedAt":"2026-09-06"}'::jsonb),
  ('operator', 'voice_ai', 'Managed AI phone service', true, '300 managed minutes included; then 25 cents per completed minute', 208,
   '{"managedVoice":true,"byoSupported":true,"pricingReviewedAt":"2026-09-06"}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.workspace_feature_entitlements (
  tenant_id, feature_key, status, usage_limit, usage_period, metadata_json
)
select s.tenant_id, 'voice_ai', 'enabled', null, 'monthly',
  jsonb_build_object(
    'category', 'Communication',
    'description', 'Managed AI phone service',
    'approvalMode', 'review_required',
    'overagePolicy', 'allow_with_review',
    'provisionedFromPlan', s.plan_key,
    'providerAndConsentControlsApply', true
  )
from public.billing_subscriptions s
where s.status in ('trialing', 'active', 'past_due', 'manual', 'incomplete')
  and s.plan_key in ('starter', 'growth', 'operator')
on conflict (tenant_id, feature_key) do update
set status = case when public.workspace_feature_entitlements.status = 'disabled'
                  then public.workspace_feature_entitlements.status else 'enabled' end,
    metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
    updated_at = now();
