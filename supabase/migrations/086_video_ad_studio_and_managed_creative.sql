alter table public.managed_service_programs
  drop constraint if exists managed_service_programs_service_family_check;

alter table public.managed_service_programs
  add constraint managed_service_programs_service_family_check
  check (service_family in ('seo', 'ads', 'creative', 'video', 'email', 'reviews', 'content', 'consulting'));

do $$
begin
  if to_regclass('public.workspace_feature_entitlements') is not null then
    insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
    select t.id, defaults.feature_key, defaults.status, defaults.usage_limit, defaults.usage_period, defaults.metadata_json
    from public.tenants t
    cross join (
      values
        (
          'video_ad_studio',
          'enabled',
          25,
          'monthly',
          '{"category":"Marketing OS","description":"Video ad briefs, scripts, scene plans, hooks, CTAs, variants, and provider-ready requests.","approvalMode":"review_required","plainRule":"Prepare video ads for review. Rendering or provider submission uses credits/add-ons.","costed":true,"creditFeature":true,"publicFacing":true}'::jsonb
        ),
        (
          'managed_video_ad_production',
          'limited',
          0,
          'monthly',
          '{"category":"Managed Growth","description":"Ferocity-managed video ad production path. Actual rendered videos require approved provider costs or manual service fees.","approvalMode":"approval_required","plainRule":"Strategy and briefs can be included. Rendered video production is chargeable.","costed":true,"addOn":true,"publicFacing":true}'::jsonb
        )
    ) as defaults(feature_key, status, usage_limit, usage_period, metadata_json)
    where t.status <> 'archived'
    on conflict (tenant_id, feature_key) do update set
      status = excluded.status,
      usage_limit = excluded.usage_limit,
      usage_period = excluded.usage_period,
      metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
      updated_at = now();
  end if;
end $$;

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
select defaults.plan_key, defaults.feature_key, defaults.feature_label, defaults.included, defaults.limit_label, defaults.sort_order, defaults.metadata_json
from (
  values
    ('starter', 'video_ad_studio', 'Video Ad Studio briefs', true, 'Starter briefs only', 236, '{"marketingOs":true,"rendersIncluded":0}'::jsonb),
    ('growth', 'video_ad_studio', 'Video Ad Studio', true, 'Briefs and variants included; renders use credits/add-on', 236, '{"marketingOs":true,"creditFeature":true,"rendersIncluded":0}'::jsonb),
    ('operator', 'video_ad_studio', 'Video Ad Studio Plus', true, 'More briefs and provider-ready jobs; renders use credits/add-on', 236, '{"marketingOs":true,"creditFeature":true,"rendersIncluded":0}'::jsonb),
    ('operator', 'managed_video_ad_production', 'Managed Video Ad Production', true, 'Custom production/credit package', 237, '{"marketingOs":true,"addOn":true}'::jsonb)
) as defaults(plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
on conflict (plan_key, feature_key) do update set
  feature_label = excluded.feature_label,
  included = excluded.included,
  limit_label = excluded.limit_label,
  sort_order = excluded.sort_order,
  metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;
