-- Extend the existing Marketing Memory and campaign recommendation primitives
-- into Ferocity's evidence-backed, organic-first AI Growth Department.

alter table public.marketing_memory_items
  drop constraint if exists marketing_memory_items_memory_type_check;

alter table public.marketing_memory_items
  add constraint marketing_memory_items_memory_type_check
  check (memory_type in (
    'headline', 'offer', 'cta', 'facebook_post', 'gbp_post', 'landing_page', 'ad', 'photo', 'video',
    'city', 'service', 'audience', 'referral_source', 'campaign', 'seasonal_pattern',
    'ideal_customer', 'customer_language', 'pain_point', 'objection', 'won_reason', 'lost_reason',
    'competitor', 'competitor_change', 'positioning', 'website_gap', 'channel_learning',
    'conversation_signal', 'brand_voice'
  ));

alter table public.marketing_memory_items
  add column if not exists confidence_score integer not null default 50 check (confidence_score between 0 and 100),
  add column if not exists evidence_json jsonb not null default '[]'::jsonb,
  add column if not exists first_observed_at timestamptz not null default now(),
  add column if not exists last_observed_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz;

alter table public.marketing_campaign_recommendations
  add column if not exists opportunity_category text not null default 'content'
    check (opportunity_category in (
      'audience', 'competitor', 'conversation', 'website', 'seo_geo', 'email', 'content',
      'offer', 'positioning', 'retention', 'referral', 'reputation', 'follow_up', 'attribution'
    )),
  add column if not exists recommended_action_key text,
  add column if not exists owner_involvement text not null default 'approval'
    check (owner_involvement in ('automatic', 'approval', 'personal')),
  add column if not exists organic_first boolean not null default true,
  add column if not exists estimated_value_cents integer check (estimated_value_cents is null or estimated_value_cents >= 0),
  add column if not exists confidence_score integer not null default 50 check (confidence_score between 0 and 100),
  add column if not exists evidence_json jsonb not null default '[]'::jsonb,
  add column if not exists learning_json jsonb not null default '{}'::jsonb,
  add column if not exists capability_keys text[] not null default '{}',
  add column if not exists execution_status text not null default 'suggested'
    check (execution_status in ('suggested', 'prepared', 'waiting_approval', 'executing', 'blocked', 'completed', 'measuring')),
  add column if not exists assessment_json jsonb not null default '{}'::jsonb,
  add column if not exists effectiveness_score integer check (effectiveness_score is null or effectiveness_score between 0 and 100),
  add column if not exists last_measured_at timestamptz,
  add column if not exists handled_at timestamptz,
  add column if not exists expires_at timestamptz;

create index if not exists marketing_memory_evidence_idx
  on public.marketing_memory_items(tenant_id, brand_id, memory_type, confidence_score desc, last_observed_at desc)
  where status <> 'archived';

create index if not exists marketing_recommendations_daily_department_idx
  on public.marketing_campaign_recommendations(tenant_id, owner_involvement, organic_first, priority_score desc, updated_at desc)
  where status in ('recommended', 'needs_review', 'approved', 'turned_into_campaign');

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select t.id, 'ai_marketing_department', 'enabled', 100, 'monthly',
  '{"category":"Growth","description":"An organic-first AI Growth Department that researches, prioritizes, prepares, executes authorized work, and learns from revenue outcomes.","approvalMode":"policy_controlled","plainRule":"Ferocity prioritizes evidence-backed organic growth. Publishing, outreach, claims, and paid spend remain subject to workspace policy; paid spend is never auto-authorized.","costed":true,"publicFacing":true}'::jsonb
from public.tenants t
where t.status <> 'archived'
on conflict (tenant_id, feature_key) do update set
  metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at = now();
