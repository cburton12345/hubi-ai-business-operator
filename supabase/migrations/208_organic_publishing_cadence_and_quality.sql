-- Included organic publishing extends the existing marketing settings,
-- quality review, and publishing queue. Nothing here enables paid spend.

alter table public.brand_marketing_settings
  add column if not exists organic_publishing_enabled boolean not null default false,
  add column if not exists organic_weekly_moment_target integer not null default 0
    check (organic_weekly_moment_target between 0 and 14),
  add column if not exists organic_channels text[] not null default array[]::text[],
  add column if not exists organic_minimum_quality_score integer not null default 80
    check (organic_minimum_quality_score between 0 and 100),
  add column if not exists organic_require_approved_source boolean not null default true;

alter table public.publishing_queue
  add column if not exists publishing_moment_key text,
  add column if not exists distribution_type text not null default 'organic'
    check (distribution_type in ('organic', 'paid', 'direct')),
  add column if not exists paid_spend_required boolean not null default false;

create unique index if not exists idx_publishing_queue_moment_platform
  on public.publishing_queue(tenant_id, publishing_moment_key, target_platform)
  where publishing_moment_key is not null and queue_status <> 'canceled';

create index if not exists idx_publishing_queue_weekly_moments
  on public.publishing_queue(tenant_id, created_at desc)
  where distribution_type = 'organic' and publishing_moment_key is not null and queue_status <> 'canceled';

insert into public.plan_feature_matrix (
  plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json
)
values
  ('starter', 'publishing_queue', 'Included organic publishing', true, '2 original publishing moments each week', 212,
   '{"includedWeeklyPublishingMoments":2,"organicOnly":true,"paidSpendSeparate":true}'::jsonb),
  ('growth', 'publishing_queue', 'Included organic publishing', true, '4 original publishing moments each week', 212,
   '{"includedWeeklyPublishingMoments":4,"organicOnly":true,"paidSpendSeparate":true}'::jsonb),
  ('operator', 'publishing_queue', 'Included organic publishing', true, 'Up to 7 original publishing moments each week', 212,
   '{"includedWeeklyPublishingMoments":7,"organicOnly":true,"paidSpendSeparate":true}'::jsonb)
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
select
  s.tenant_id,
  'publishing_queue',
  'enabled',
  case s.plan_key when 'starter' then 2 when 'growth' then 4 when 'operator' then 7 end,
  'weekly',
  jsonb_build_object(
    'includedWeeklyPublishingMoments', case s.plan_key when 'starter' then 2 when 'growth' then 4 when 'operator' then 7 end,
    'approvalMode', 'review_required',
    'overagePolicy', 'block',
    'organicOnly', true,
    'paidSpendSeparate', true,
    'requiresExplicitOptIn', true,
    'qualityGateRequired', true,
    'provisionedFromPlan', s.plan_key
  )
from public.billing_subscriptions s
where s.status in ('trialing', 'active', 'past_due', 'manual', 'incomplete')
  and s.plan_key in ('starter', 'growth', 'operator')
on conflict (tenant_id, feature_key) do update
set status = case when public.workspace_feature_entitlements.status = 'disabled'
                  then public.workspace_feature_entitlements.status else 'enabled' end,
    usage_limit = excluded.usage_limit,
    usage_period = 'weekly',
    metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
    updated_at = now();

comment on column public.publishing_queue.publishing_moment_key is
  'One original idea shared by its channel-specific adaptations; used for weekly allowance counting.';
comment on column public.publishing_queue.paid_spend_required is
  'True only for paid distribution. Organic entitlement never authorizes advertising spend.';
