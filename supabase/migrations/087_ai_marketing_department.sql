alter table public.marketing_os_business_profiles
  add column if not exists brand_identity_json jsonb not null default '{}'::jsonb,
  add column if not exists audience_json jsonb not null default '{}'::jsonb,
  add column if not exists positioning_json jsonb not null default '{}'::jsonb,
  add column if not exists pricing_json jsonb not null default '{}'::jsonb,
  add column if not exists proof_json jsonb not null default '{}'::jsonb,
  add column if not exists seasonality_json jsonb not null default '{}'::jsonb,
  add column if not exists capacity_json jsonb not null default '{}'::jsonb,
  add column if not exists marketing_rules_json jsonb not null default '{}'::jsonb;

alter table public.brand_marketing_settings
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table public.content_studio_outputs
  drop constraint if exists content_studio_outputs_output_type_check;

alter table public.content_studio_outputs
  add constraint content_studio_outputs_output_type_check
  check (output_type in (
    'facebook_post',
    'instagram_post',
    'linkedin_post',
    'x_post',
    'tiktok_caption',
    'youtube_ad',
    'youtube_short_script',
    'reddit_ad',
    'google_search_ad',
    'google_display_ad',
    'microsoft_ad',
    'local_service_ad',
    'retargeting_ad',
    'gbp_post',
    'blog_article',
    'email_campaign',
    'sms_campaign',
    'landing_page',
    'city_page',
    'service_page',
    'case_study',
    'customer_spotlight',
    'door_hanger',
    'flyer',
    'yard_sign',
    'referral_card',
    'seasonal_promotion',
    'referral_campaign',
    'service_campaign',
    'review_campaign',
    'storm_campaign',
    'promotional_campaign',
    'ad_copy',
    'image_ad',
    'short_video_script'
  ));

create table if not exists public.marketing_memory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  memory_type text not null
    check (memory_type in (
      'headline',
      'offer',
      'cta',
      'facebook_post',
      'gbp_post',
      'landing_page',
      'ad',
      'photo',
      'video',
      'city',
      'service',
      'audience',
      'referral_source',
      'campaign',
      'seasonal_pattern'
    )),
  title text not null,
  summary text,
  source_table text,
  source_id uuid,
  performance_json jsonb not null default '{}'::jsonb,
  score integer not null default 50 check (score between 0 and 100),
  status text not null default 'learning'
    check (status in ('learning', 'winner', 'needs_more_data', 'avoid', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_campaign_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  recommendation_key text not null,
  title text not null,
  trigger_reason text not null,
  primary_goal text not null,
  recommended_channels text[] not null default '{}',
  recommended_outputs_json jsonb not null default '[]'::jsonb,
  expected_impact text,
  difficulty text not null default 'medium'
    check (difficulty in ('low', 'medium', 'high')),
  priority_score integer not null default 50 check (priority_score between 0 and 100),
  status text not null default 'recommended'
    check (status in ('recommended', 'needs_review', 'approved', 'turned_into_campaign', 'dismissed', 'paused')),
  source_signals_json jsonb not null default '{}'::jsonb,
  campaign_id uuid references public.content_studio_campaigns(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, recommendation_key)
);

create index if not exists idx_marketing_memory_items_tenant
  on public.marketing_memory_items(tenant_id, brand_id, memory_type, status, score desc);

create index if not exists idx_marketing_campaign_recommendations_tenant
  on public.marketing_campaign_recommendations(tenant_id, brand_id, status, priority_score desc, created_at desc);

alter table public.marketing_memory_items enable row level security;
alter table public.marketing_campaign_recommendations enable row level security;

drop policy if exists marketing_memory_items_tenant_operator on public.marketing_memory_items;
create policy marketing_memory_items_tenant_operator
on public.marketing_memory_items
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists marketing_campaign_recommendations_tenant_operator on public.marketing_campaign_recommendations;
create policy marketing_campaign_recommendations_tenant_operator
on public.marketing_campaign_recommendations
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select t.id, defaults.feature_key, defaults.status, defaults.usage_limit, defaults.usage_period, defaults.metadata_json
from public.tenants t
cross join (
  values
    ('ai_marketing_department', 'enabled', 100, 'monthly', '{"category":"AI Workforce","description":"Marketing department recommendations, campaign planning, Brand Intelligence, and Marketing Memory.","approvalMode":"review_required","plainRule":"Ferocity can recommend and prepare campaigns. Publishing and ad spend require approval.","costed":true,"publicFacing":true}'::jsonb),
    ('marketing_memory', 'enabled', 250, 'monthly', '{"category":"Marketing OS","description":"Track what headlines, offers, assets, services, cities, and campaigns perform best.","approvalMode":"review_required","plainRule":"Use results to improve recommendations without claiming unsupported revenue.","costed":false,"publicFacing":false}'::jsonb),
    ('managed_ad_account_architecture', 'limited', 0, 'monthly', '{"category":"Managed Growth","description":"Future Ferocity-managed ad account path with transparent spend, fees, approvals, and reporting.","approvalMode":"approval_required","plainRule":"Default remains customer-owned ad accounts. Managed advertising is future/premium only.","costed":true,"future":true,"publicFacing":true}'::jsonb)
) as defaults(feature_key, status, usage_limit, usage_period, metadata_json)
where t.status <> 'archived'
on conflict (tenant_id, feature_key) do update set
  status = excluded.status,
  usage_limit = excluded.usage_limit,
  usage_period = excluded.usage_period,
  metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at = now();

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('starter', 'ai_marketing_department', 'AI Marketing Department', true, 'Recommendations and draft campaigns', 238, '{"marketingOs":true}'::jsonb),
  ('growth', 'marketing_memory', 'Marketing Memory', true, 'Learns from campaigns, assets, cities, services, and lead sources', 239, '{"marketingOs":true}'::jsonb),
  ('operator', 'ai_marketing_department', 'AI Marketing Department Plus', true, 'More recommendations, campaign drafts, and optimization checks', 238, '{"marketingOs":true}'::jsonb),
  ('operator', 'managed_ad_account_architecture', 'Managed Ad Account Architecture', true, 'Future premium managed ad path', 240, '{"marketingOs":true,"future":true}'::jsonb)
on conflict (plan_key, feature_key) do update set
  feature_label = excluded.feature_label,
  included = excluded.included,
  limit_label = excluded.limit_label,
  sort_order = excluded.sort_order,
  metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;

insert into public.marketing_os_campaign_blueprints (
  campaign_key, label, plain_goal, prompt_starter, content_types, recommended_outputs_json, minimum_plan_key, sort_order, metadata_json
)
values
  ('fill_open_schedule', 'Fill Open Schedule', 'Create demand when crews, staff, or appointment slots have openings.', 'We have openings soon. Build a campaign to fill the schedule with profitable work.', array['facebook_post','gbp_post','google_search_ad','email_campaign','landing_page','door_hanger'], '["Schedule-fill offer","Facebook post","Google ad","Email","Landing page","Door hanger"]'::jsonb, 'starter', 8, '{"oneClick":true,"aiMarketingDepartment":true,"usesCapacity":true}'::jsonb),
  ('completed_job_proof_machine', 'Turn Completed Jobs Into Marketing', 'Turn completed work into reviews, proof, posts, case studies, and nearby demand.', 'Use completed jobs, photos, reviews, and customer proof to create the next marketing push.', array['gbp_post','facebook_post','case_study','customer_spotlight','review_campaign','image_ad'], '["Review ask","GBP post","Before/after post","Case study","Image ad"]'::jsonb, 'starter', 9, '{"oneClick":true,"aiMarketingDepartment":true,"usesProof":true}'::jsonb),
  ('high_margin_service_push', 'Push High-Margin Services', 'Focus marketing on the services that make the business the most money.', 'Build a campaign around our most profitable service and best customer type.', array['landing_page','google_search_ad','facebook_post','email_campaign','service_page','short_video_script'], '["Service page","Google ad","Social post","Email","Video script"]'::jsonb, 'growth', 15, '{"oneClick":true,"aiMarketingDepartment":true,"usesMargins":true}'::jsonb),
  ('slow_season_pipeline', 'Prepare Slow Season Pipeline', 'Build demand before the slow season hits.', 'Create a slow-season campaign using offers, referrals, reviews, service pages, and past customers.', array['email_campaign','referral_campaign','facebook_post','gbp_post','blog_article','retargeting_ad'], '["Email","Referral ask","Social post","GBP post","Blog","Retargeting ad"]'::jsonb, 'growth', 16, '{"oneClick":true,"aiMarketingDepartment":true,"usesSeasonality":true}'::jsonb)
on conflict (campaign_key) do update set
  label = excluded.label,
  plain_goal = excluded.plain_goal,
  prompt_starter = excluded.prompt_starter,
  content_types = excluded.content_types,
  recommended_outputs_json = excluded.recommended_outputs_json,
  minimum_plan_key = excluded.minimum_plan_key,
  sort_order = excluded.sort_order,
  metadata_json = public.marketing_os_campaign_blueprints.metadata_json || excluded.metadata_json,
  updated_at = now();
