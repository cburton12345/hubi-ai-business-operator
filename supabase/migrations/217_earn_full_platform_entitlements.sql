-- Ferocity Earn is the performance-priced path into the complete operating
-- system. It is not a Free-plan alias. Provider usage, ad spend, payment
-- processing, and other third-party costs remain separately controlled.

update public.billing_plans
set metadata_json=metadata_json || '{
  "entitlementReferencePlan":"operator",
  "fullOperatingSystem":true,
  "providerUsageSeparate":true
}'::jsonb
where plan_key='earn';

insert into public.workspace_feature_entitlements (
  tenant_id,feature_key,status,usage_limit,usage_period,metadata_json,updated_at
)
select
  s.tenant_id,
  f.feature_key,
  'enabled',
  null,
  'monthly',
  f.metadata_json || jsonb_build_object(
    'provisionedFromPlan','earn',
    'entitlementReferencePlan','operator',
    'pricingModel','earned_revenue',
    'approvalMode',coalesce(f.metadata_json->>'approvalMode','review_required'),
    'providerUsageSeparate',true
  ),
  now()
from public.billing_subscriptions s
join public.plan_feature_matrix f on f.plan_key='operator' and f.included=true
where s.plan_key='earn' and s.status in ('manual','active','trialing','past_due')
on conflict (tenant_id,feature_key) do update
set status='enabled',
    metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
    updated_at=now();
