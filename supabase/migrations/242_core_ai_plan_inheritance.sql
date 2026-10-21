-- Core Ask Ferocity AI must remain available when a customer upgrades beyond Starter.
-- Earlier plan-matrix rows described ai_generation only for free/job_tracker/starter,
-- while runtime plan policy correctly allowed it for higher self-serve tiers. This
-- aligns provisioning data with that policy and repairs existing eligible workspaces.

insert into public.plan_feature_matrix (
  plan_key,feature_key,feature_label,included,limit_label,sort_order,metadata_json
)
values
  ('earn','ai_generation','Core AI guidance',true,'Provider-cost guarded AI guidance and execution planning',80,'{"serviceControl":true,"coreAi":true,"inherited":true}'::jsonb),
  ('ferocity_connect','ai_generation','Core AI guidance',true,'Provider-cost guarded AI guidance and execution planning',80,'{"serviceControl":true,"coreAi":true,"inherited":true}'::jsonb),
  ('growth','ai_generation','Core AI guidance',true,'Provider-cost guarded AI guidance and execution planning',80,'{"serviceControl":true,"coreAi":true,"inherited":true}'::jsonb),
  ('operator','ai_generation','Core AI guidance',true,'Provider-cost guarded AI guidance and execution planning',80,'{"serviceControl":true,"coreAi":true,"inherited":true}'::jsonb)
on conflict (plan_key,feature_key) do update
set included=true,
    feature_label=excluded.feature_label,
    limit_label=excluded.limit_label,
    sort_order=excluded.sort_order,
    metadata_json=public.plan_feature_matrix.metadata_json || excluded.metadata_json,
    updated_at=now();

with eligible as (
  select t.id,
    coalesce((
      select s.plan_key from public.billing_subscriptions s
      where s.tenant_id=t.id and s.status in ('trialing','active','manual','past_due','incomplete')
      order by s.updated_at desc nulls last,s.created_at desc limit 1
    ),t.plan_key,'free') as plan_key
  from public.tenants t
  where t.status<>'archived'
), allowed as (
  select id,plan_key from eligible
  where plan_key in ('free','earn','ferocity_connect','job_tracker','starter','growth','operator','managed_operator','pro_agency')
)
insert into public.workspace_feature_entitlements (
  tenant_id,feature_key,status,usage_limit,usage_period,metadata_json,updated_at
)
select id,'ai_generation','enabled',null,'monthly',
  jsonb_build_object(
    'provisionedFromPlan',plan_key,
    'coreAi',true,
    'inheritedServiceFeature',true,
    'approvalMode','review_required',
    'overagePolicy','allow',
    'plainRule','Core AI may inspect, reason, draft, and prepare authorized work. Consequential actions remain separately controlled.'
  ),now()
from allowed
on conflict (tenant_id,feature_key) do update
set status='enabled',
    usage_period='monthly',
    metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
    updated_at=now();
