create table if not exists public.marketing_os_business_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  company_name text,
  website_url text,
  primary_phone text,
  primary_email text,
  brand_voice text,
  ideal_customers text,
  services_json jsonb not null default '[]'::jsonb,
  service_areas_json jsonb not null default '[]'::jsonb,
  team_members_json jsonb not null default '[]'::jsonb,
  social_links_json jsonb not null default '{}'::jsonb,
  faqs_json jsonb not null default '[]'::jsonb,
  offers_json jsonb not null default '[]'::jsonb,
  reviews_json jsonb not null default '[]'::jsonb,
  uploaded_assets_json jsonb not null default '[]'::jsonb,
  imported_from_url text,
  source text not null default 'ferocity'
    check (source in ('ferocity', 'manual', 'website_import', 'setup_operator', 'api')),
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'needs_review', 'archived')),
  last_refreshed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_marketing_os_business_profiles_unique_brand
  on public.marketing_os_business_profiles(tenant_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.marketing_os_website_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  website_url text not null,
  status text not null default 'queued'
    check (status in ('queued', 'scanning', 'needs_review', 'imported', 'failed', 'canceled')),
  extraction_json jsonb not null default '{}'::jsonb,
  profile_id uuid references public.marketing_os_business_profiles(id) on delete set null,
  error_message text,
  requested_by_user_id uuid references public.users(id) on delete set null,
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_os_campaign_blueprints (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null unique,
  label text not null,
  plain_goal text not null,
  prompt_starter text not null,
  content_types text[] not null default '{}',
  recommended_outputs_json jsonb not null default '[]'::jsonb,
  minimum_plan_key text not null default 'free',
  sort_order integer not null default 0,
  status text not null default 'active'
    check (status in ('active', 'planned', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_studio_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  profile_id uuid references public.marketing_os_business_profiles(id) on delete set null,
  campaign_key text references public.marketing_os_campaign_blueprints(campaign_key) on delete set null,
  prompt text not null,
  campaign_name text not null,
  goal text,
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'approved', 'scheduled', 'published_manually', 'archived')),
  mode text not null default 'simple'
    check (mode in ('simple', 'advanced')),
  approval_required boolean not null default true,
  output_count integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_studio_outputs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  campaign_id uuid not null references public.content_studio_campaigns(id) on delete cascade,
  output_type text not null
    check (output_type in ('facebook_post', 'instagram_post', 'linkedin_post', 'x_post', 'tiktok_caption', 'gbp_post', 'blog_article', 'email_campaign', 'sms_campaign', 'landing_page', 'seasonal_promotion', 'referral_campaign', 'service_campaign', 'review_campaign', 'storm_campaign', 'promotional_campaign', 'ad_copy')),
  platform text,
  title text not null,
  body text,
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'approved', 'scheduled', 'published_manually', 'archived')),
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high')),
  scheduled_for timestamptz,
  source_ai_draft_id uuid references public.ai_drafts(id) on delete set null,
  source_calendar_item_id uuid references public.marketing_calendar_items(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_media_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  asset_type text not null
    check (asset_type in ('photo', 'logo', 'video', 'document', 'testimonial_text', 'other')),
  title text not null,
  storage_bucket text,
  storage_path text,
  external_url text,
  service_label text,
  campaign_label text,
  project_label text,
  tags text[] not null default '{}',
  approved_for_ai_reuse boolean not null default false,
  permission_status text not null default 'unknown'
    check (permission_status in ('unknown', 'approved', 'needs_review', 'rejected', 'expired')),
  status text not null default 'active'
    check (status in ('active', 'needs_review', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_media_asset_has_location check (
    asset_type = 'testimonial_text'
    or external_url is not null
    or storage_path is not null
  )
);

create table if not exists public.marketing_graphic_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  campaign_id uuid references public.content_studio_campaigns(id) on delete set null,
  job_type text not null
    check (job_type in ('review_graphic', 'before_after', 'image_ad')),
  target_formats text[] not null default '{}',
  before_asset_id uuid references public.marketing_media_assets(id) on delete set null,
  after_asset_id uuid references public.marketing_media_assets(id) on delete set null,
  source_review_id uuid,
  service_label text,
  service_area text,
  offer_label text,
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'approved', 'generated', 'exported', 'failed', 'archived')),
  provider_key text,
  prompt_json jsonb not null default '{}'::jsonb,
  output_assets_json jsonb not null default '[]'::jsonb,
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_video_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  campaign_id uuid references public.content_studio_campaigns(id) on delete set null,
  provider_key text not null default 'provider_not_selected',
  service_label text,
  goal text,
  offer_label text,
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'provider_ready', 'submitted', 'processing', 'completed', 'failed', 'archived')),
  script_text text,
  scenes_json jsonb not null default '[]'::jsonb,
  voiceover_text text,
  cta_text text,
  provider_request_json jsonb not null default '{}'::jsonb,
  provider_response_json jsonb not null default '{}'::jsonb,
  history_json jsonb not null default '[]'::jsonb,
  output_url text,
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_os_website_imports_tenant
  on public.marketing_os_website_imports(tenant_id, status, created_at desc);
create index if not exists idx_content_studio_campaigns_tenant
  on public.content_studio_campaigns(tenant_id, status, updated_at desc);
create index if not exists idx_content_studio_outputs_campaign
  on public.content_studio_outputs(campaign_id, status, output_type);
create index if not exists idx_marketing_media_assets_tenant
  on public.marketing_media_assets(tenant_id, brand_id, status, approved_for_ai_reuse);
create index if not exists idx_marketing_graphic_jobs_tenant
  on public.marketing_graphic_jobs(tenant_id, job_type, status, created_at desc);
create index if not exists idx_marketing_video_jobs_tenant
  on public.marketing_video_jobs(tenant_id, status, provider_key, created_at desc);

alter table public.marketing_os_business_profiles enable row level security;
alter table public.marketing_os_website_imports enable row level security;
alter table public.marketing_os_campaign_blueprints enable row level security;
alter table public.content_studio_campaigns enable row level security;
alter table public.content_studio_outputs enable row level security;
alter table public.marketing_media_assets enable row level security;
alter table public.marketing_graphic_jobs enable row level security;
alter table public.marketing_video_jobs enable row level security;

drop policy if exists marketing_os_campaign_blueprints_readable on public.marketing_os_campaign_blueprints;
create policy marketing_os_campaign_blueprints_readable
on public.marketing_os_campaign_blueprints
for select
using (true);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'marketing_os_business_profiles',
    'marketing_os_website_imports',
    'content_studio_campaigns',
    'content_studio_outputs',
    'marketing_media_assets',
    'marketing_graphic_jobs',
    'marketing_video_jobs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

insert into public.marketing_os_campaign_blueprints (
  campaign_key, label, plain_goal, prompt_starter, content_types, recommended_outputs_json, minimum_plan_key, sort_order, metadata_json
)
values
  ('storm_campaign', 'Create Storm Campaign', 'Turn urgent weather demand into tracked leads and reviewed follow-up.', 'Create a storm damage campaign for our main service area.', array['storm_campaign','facebook_post','gbp_post','landing_page','sms_campaign','ad_copy'], '["Facebook post","GBP post","Landing page","SMS follow-up","Ad copy"]'::jsonb, 'free', 10, '{"oneClick":true}'::jsonb),
  ('review_campaign', 'Create Review Campaign', 'Capture trust from completed work and turn proof into approved content.', 'Create a review campaign for happy customers after completed jobs.', array['review_campaign','email_campaign','sms_campaign','gbp_post','review_campaign'], '["Review request email","Review request SMS","GBP post idea","Testimonial graphic"]'::jsonb, 'free', 20, '{"oneClick":true}'::jsonb),
  ('referral_campaign', 'Create Referral Campaign', 'Ask past customers and partners for warm introductions.', 'Create a referral campaign for past customers.', array['referral_campaign','email_campaign','facebook_post','sms_campaign'], '["Referral email","Facebook post","SMS reminder"]'::jsonb, 'growth', 30, '{"oneClick":true}'::jsonb),
  ('seasonal_campaign', 'Create Seasonal Campaign', 'Plan timely seasonal demand before the rush.', 'Create a seasonal promotion for our highest-value service.', array['seasonal_promotion','facebook_post','instagram_post','gbp_post','landing_page'], '["Social posts","GBP post","Landing page","Email campaign"]'::jsonb, 'growth', 40, '{"oneClick":true}'::jsonb),
  ('new_customer_campaign', 'Create New Customer Campaign', 'Explain the offer clearly to first-time customers.', 'Create a new customer campaign for people who do not know us yet.', array['promotional_campaign','ad_copy','landing_page','email_campaign'], '["Ad copy","Landing page","Welcome email"]'::jsonb, 'growth', 50, '{"oneClick":true}'::jsonb),
  ('lead_reactivation_campaign', 'Create Lead Reactivation Campaign', 'Recover stale leads without spam or surprise sends.', 'Create a lead reactivation campaign for older leads that never booked.', array['service_campaign','email_campaign','sms_campaign','facebook_post'], '["Email follow-up","SMS draft","Facebook reminder","Operator task"]'::jsonb, 'growth', 60, '{"oneClick":true}'::jsonb)
on conflict (campaign_key) do update
set label = excluded.label,
    plain_goal = excluded.plain_goal,
    prompt_starter = excluded.prompt_starter,
    content_types = excluded.content_types,
    recommended_outputs_json = excluded.recommended_outputs_json,
    minimum_plan_key = excluded.minimum_plan_key,
    sort_order = excluded.sort_order,
    metadata_json = excluded.metadata_json,
    updated_at = now();

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select t.id, defaults.feature_key, defaults.status, defaults.usage_limit, defaults.usage_period, defaults.metadata_json
from public.tenants t
cross join (
  values
    ('marketing_os_profile', 'enabled', 10, 'monthly', '{"category":"Marketing OS","description":"Business profile memory for AI setup and content generation","approvalMode":"manual","plainRule":"Keep the business facts in one place.","costed":false,"publicFacing":false}'::jsonb),
    ('website_import', 'enabled', 25, 'monthly', '{"category":"Marketing OS","description":"Website import requests for profile setup","approvalMode":"review_required","plainRule":"Import website facts for review before using them.","costed":true,"publicFacing":false}'::jsonb),
    ('content_studio', 'enabled', 100, 'monthly', '{"category":"Marketing OS","description":"Campaign prompts and draft content outputs","approvalMode":"review_required","plainRule":"Generate drafts, then review before publishing.","costed":true,"publicFacing":false}'::jsonb),
    ('media_library', 'enabled', 500, 'monthly', '{"category":"Marketing OS","description":"Approved photos, logos, videos, proof, and campaign assets","approvalMode":"review_required","plainRule":"Reuse approved media only.","costed":true,"publicFacing":false}'::jsonb),
    ('marketing_graphics', 'enabled', 100, 'monthly', '{"category":"Marketing OS","description":"Review graphics, before/after graphics, and image ad jobs","approvalMode":"review_required","plainRule":"Create graphic jobs as drafts for review.","costed":true,"publicFacing":true}'::jsonb),
    ('ai_video_generation', 'limited', 10, 'monthly', '{"category":"Marketing OS","description":"Provider-agnostic AI video job requests","approvalMode":"review_required","plainRule":"Prepare video scripts and jobs. Submit only after provider keys and approval.","costed":true,"creditFeature":true,"overagePolicy":"block","publicFacing":true}'::jsonb),
    ('voice_ai', 'limited', 60, 'monthly', '{"category":"Marketing OS","description":"Voice AI minutes placeholder for future provider usage","approvalMode":"review_required","plainRule":"Voice AI is metered and provider-gated.","costed":true,"creditFeature":true,"overagePolicy":"block","publicFacing":true}'::jsonb),
    ('bulk_email', 'limited', 1000, 'monthly', '{"category":"Marketing OS","description":"Bulk email campaign allowance","approvalMode":"review_required","plainRule":"Bulk email needs sender verification and unsubscribe rules.","costed":true,"overagePolicy":"allow_with_review","publicFacing":true}'::jsonb),
    ('premium_ai_tasks', 'limited', 100, 'monthly', '{"category":"Marketing OS","description":"Premium AI planning, generation, and analysis tasks","approvalMode":"review_required","plainRule":"Use premium AI carefully and track monthly usage.","costed":true,"creditFeature":true,"overagePolicy":"block","publicFacing":false}'::jsonb)
) as defaults(feature_key, status, usage_limit, usage_period, metadata_json)
on conflict (tenant_id, feature_key) do update
set status = excluded.status,
    usage_limit = coalesce(public.workspace_feature_entitlements.usage_limit, excluded.usage_limit),
    usage_period = excluded.usage_period,
    metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json;

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('free', 'marketing_os_profile', 'Business Profile Memory', true, '1 profile, manual setup', 200, '{"marketingOs":true}'::jsonb),
  ('free', 'content_studio', 'Content Studio Starter', true, 'Limited draft campaigns', 205, '{"marketingOs":true}'::jsonb),
  ('free', 'media_library', 'Media Library Starter', true, 'Limited approved assets', 210, '{"marketingOs":true}'::jsonb),
  ('starter', 'website_import', 'Website Import', true, 'Website import requests', 215, '{"marketingOs":true}'::jsonb),
  ('starter', 'marketing_graphics', 'Review And Before/After Graphics', true, 'Draft graphics with review', 220, '{"marketingOs":true}'::jsonb),
  ('growth', 'content_studio', 'Content Studio', true, 'Campaign drafts across channels', 205, '{"marketingOs":true}'::jsonb),
  ('growth', 'bulk_email', 'Bulk Email Campaigns', true, 'Included monthly allowance', 225, '{"marketingOs":true,"usageBased":true}'::jsonb),
  ('growth', 'premium_ai_tasks', 'Premium AI Tasks', true, 'Included monthly allowance', 230, '{"marketingOs":true,"usageBased":true}'::jsonb),
  ('operator', 'ai_video_generation', 'AI Video Generation', true, 'Provider-gated monthly credits', 235, '{"marketingOs":true,"usageBased":true,"creditFeature":true}'::jsonb),
  ('operator', 'voice_ai', 'Voice AI', true, 'Provider-gated monthly minutes', 240, '{"marketingOs":true,"usageBased":true,"creditFeature":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;
