-- Extend Content Studio and creative variants with the organic -> validate -> amplify lifecycle.
-- Growth events and attribution touches remain the performance source of truth.

alter table public.content_studio_campaigns
  add column if not exists strategy_origin text not null default 'manual'
    check (strategy_origin in ('manual', 'growth_department', 'customer_proof', 'weather_demand', 'campaign')),
  add column if not exists source_recommendation_id uuid references public.marketing_campaign_recommendations(id) on delete set null,
  add column if not exists research_snapshot_json jsonb not null default '{}'::jsonb,
  add column if not exists learning_status text not null default 'not_started'
    check (learning_status in ('not_started', 'collecting', 'enough_signal', 'learned', 'archived'));

alter table public.content_studio_outputs
  add column if not exists content_key text,
  add column if not exists variant_group_key text,
  add column if not exists audience_hypothesis text,
  add column if not exists message_hypothesis text,
  add column if not exists organic_validation_status text not null default 'untested'
    check (organic_validation_status in ('untested', 'testing', 'promising', 'winner', 'inconclusive', 'underperforming')),
  add column if not exists performance_json jsonb not null default '{}'::jsonb,
  add column if not exists validated_at timestamptz,
  add column if not exists paid_amplification_status text not null default 'not_eligible'
    check (paid_amplification_status in ('not_eligible', 'eligible', 'recommended', 'approved', 'launched', 'rejected', 'paused'));

alter table public.marketing_creative_variants
  add column if not exists validation_mode text not null default 'organic_first'
    check (validation_mode in ('organic_first', 'manual', 'paid_test')),
  add column if not exists organic_output_id uuid references public.content_studio_outputs(id) on delete set null,
  add column if not exists paid_amplification_status text not null default 'not_eligible'
    check (paid_amplification_status in ('not_eligible', 'eligible', 'recommended', 'approved', 'launched', 'rejected', 'paused'));

alter table public.ai_drafts drop constraint if exists ai_drafts_content_type_check;
alter table public.ai_drafts add constraint ai_drafts_content_type_check check (content_type in (
  'blog', 'facebook_post', 'instagram_post', 'linkedin_post', 'x_post', 'tiktok_caption', 'gbp_post',
  'landing_page', 'city_page', 'service_page', 'google_ad', 'facebook_ad', 'email', 'sms',
  'case_study', 'customer_spotlight', 'faq', 'video_script', 'newsletter', 'internal_training_note',
  'schema_markup', 'website_recommendation'
));

create unique index if not exists content_studio_output_content_key_unique
  on public.content_studio_outputs(tenant_id, content_key)
  where content_key is not null;

create index if not exists content_studio_outputs_validation_idx
  on public.content_studio_outputs(tenant_id, brand_id, organic_validation_status, paid_amplification_status, updated_at desc)
  where status <> 'archived';

create index if not exists content_studio_campaign_growth_source_idx
  on public.content_studio_campaigns(tenant_id, source_recommendation_id, strategy_origin)
  where source_recommendation_id is not null;

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select tenant.id, 'content_studio', 'enabled', 100, 'monthly',
  '{"category":"Growth","description":"Audience-informed, platform-specific content packages with organic validation before paid amplification.","approvalMode":"review_required","plainRule":"Ferocity may research and prepare variants. Public distribution follows channel policy; paid amplification always requires explicit approval and an available ad account.","costed":true,"publicFacing":true}'::jsonb
from public.tenants tenant
where tenant.status <> 'archived'
on conflict (tenant_id, feature_key) do update set
  metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at = now();
