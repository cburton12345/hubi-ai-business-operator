create table if not exists public.ai_search_visibility_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  platform_key text not null
    check (platform_key in ('google', 'google_ai_overviews', 'chatgpt', 'perplexity', 'gemini', 'reddit', 'google_business_profile')),
  check_name text not null,
  query_text text not null,
  result_summary text,
  visibility_score integer check (visibility_score between 0 and 100),
  status text not null default 'manual_check'
    check (status in ('manual_check', 'needs_connection', 'queued', 'checked', 'needs_work', 'improving', 'paused')),
  last_checked_at timestamptz,
  next_check_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seo_content_strategy_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  strategy_name text not null default '30-day local growth plan',
  content_type text not null
    check (content_type in ('service_page', 'city_page', 'blog_article', 'gbp_post', 'social_post', 'faq', 'comparison_page', 'proof_page')),
  title text not null,
  target_keyword text,
  target_prompt text,
  service_focus text,
  city_focus text,
  publish_target text not null default 'review_queue'
    check (publish_target in ('customer_website', 'ferocity_hosted_page', 'google_business_profile', 'social', 'manual_export', 'review_queue')),
  status text not null default 'planned'
    check (status in ('planned', 'drafted', 'needs_review', 'approved', 'published_manually', 'paused', 'done')),
  scheduled_for date,
  priority_score integer not null default 50 check (priority_score between 0 and 100),
  source_draft_id uuid references public.ai_drafts(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seo_authority_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  task_type text not null
    check (task_type in ('local_citation', 'partner_link', 'customer_proof', 'directory_profile', 'community_visibility', 'press_mention', 'internal_linking')),
  title text not null,
  description text not null,
  target_url text,
  status text not null default 'open'
    check (status in ('open', 'planned', 'needs_owner', 'in_progress', 'done', 'paused', 'dismissed')),
  priority_score integer not null default 50 check (priority_score between 0 and 100),
  due_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_publishing_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  provider_key text not null
    check (provider_key in ('manual_export', 'customer_website', 'google_business_profile', 'wordpress', 'webflow', 'shopify', 'wix', 'netlify', 'custom_webhook')),
  display_name text not null,
  target_url text,
  status text not null default 'not_connected'
    check (status in ('not_connected', 'needs_attention', 'connected', 'paused', 'archived')),
  live_publish_enabled boolean not null default false,
  requires_approval boolean not null default true,
  last_sync_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, provider_key)
);

create index if not exists idx_ai_search_visibility_tenant
  on public.ai_search_visibility_checks(tenant_id, brand_id, platform_key, status, next_check_at);
create index if not exists idx_seo_content_strategy_tenant
  on public.seo_content_strategy_items(tenant_id, brand_id, status, scheduled_for, priority_score desc);
create index if not exists idx_seo_authority_tasks_tenant
  on public.seo_authority_tasks(tenant_id, brand_id, status, priority_score desc);
create index if not exists idx_brand_publishing_connections_tenant
  on public.brand_publishing_connections(tenant_id, brand_id, status, provider_key);

create unique index if not exists idx_ai_search_visibility_unique_check
  on public.ai_search_visibility_checks(tenant_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), platform_key, query_text);
create unique index if not exists idx_seo_content_strategy_unique_item
  on public.seo_content_strategy_items(tenant_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), strategy_name, title, content_type);
create unique index if not exists idx_seo_authority_tasks_unique_task
  on public.seo_authority_tasks(tenant_id, coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid), task_type, title);
create unique index if not exists idx_ai_search_visibility_unique_brand_check
  on public.ai_search_visibility_checks(tenant_id, brand_id, platform_key, query_text);
create unique index if not exists idx_seo_content_strategy_unique_brand_item
  on public.seo_content_strategy_items(tenant_id, brand_id, strategy_name, title, content_type);
create unique index if not exists idx_seo_authority_tasks_unique_brand_task
  on public.seo_authority_tasks(tenant_id, brand_id, task_type, title);

alter table public.ai_search_visibility_checks enable row level security;
alter table public.seo_content_strategy_items enable row level security;
alter table public.seo_authority_tasks enable row level security;
alter table public.brand_publishing_connections enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ai_search_visibility_checks',
    'seo_content_strategy_items',
    'seo_authority_tasks',
    'brand_publishing_connections'
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

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select t.id, defaults.feature_key, defaults.status, defaults.usage_limit, defaults.usage_period, defaults.metadata_json
from public.tenants t
cross join (
  values
    ('ai_search_visibility', 'enabled', 100, 'monthly', '{"category":"SEO / GEO","description":"Track prompts and searches where the brand should appear in Google and AI search.","approvalMode":"review_required","plainRule":"Check visibility and create improvement tasks. Do not claim rankings without evidence.","costed":true,"publicFacing":false}'::jsonb),
    ('seo_content_strategy', 'enabled', 120, 'monthly', '{"category":"SEO / GEO","description":"30-day service, city, blog, FAQ, proof, and GBP content planning.","approvalMode":"draft_only","plainRule":"Plan useful content from real services, cities, proof, and customer questions.","costed":true,"publicFacing":true}'::jsonb),
    ('authority_builder', 'enabled', 60, 'monthly', '{"category":"SEO / GEO","description":"Local citations, proof, community, partner, and authority-building tasks.","approvalMode":"review_required","plainRule":"Build authority without spammy link schemes.","costed":true,"publicFacing":true}'::jsonb),
    ('cms_publishing_connections', 'enabled', 10, 'monthly', '{"category":"SEO / GEO","description":"CMS, website, manual export, and hosted-page publishing connection records.","approvalMode":"review_required","plainRule":"Prepare where approved content can go. Live publish stays off until connected and approved.","costed":false,"publicFacing":false}'::jsonb)
) as defaults(feature_key, status, usage_limit, usage_period, metadata_json)
on conflict (tenant_id, feature_key) do update
set status = excluded.status,
    usage_limit = coalesce(public.workspace_feature_entitlements.usage_limit, excluded.usage_limit),
    usage_period = excluded.usage_period,
    metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json;

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('free', 'ai_search_visibility', 'AI Search Visibility Snapshot', true, 'Starter visibility checks', 245, '{"seoGeo":true}'::jsonb),
  ('starter', 'seo_content_strategy', '30-Day SEO Content Plan', true, 'Draft content strategy', 250, '{"seoGeo":true}'::jsonb),
  ('starter', 'cms_publishing_connections', 'Website Publishing Setup', true, 'Manual export and connection stubs', 255, '{"seoGeo":true}'::jsonb),
  ('growth', 'authority_builder', 'Local Authority Builder', true, 'Authority tasks and proof workflow', 260, '{"seoGeo":true}'::jsonb),
  ('growth', 'ai_search_visibility', 'AI + Google Visibility Tracking', true, 'Monthly checks and tasks', 265, '{"seoGeo":true}'::jsonb),
  ('operator', 'seo_content_strategy', 'SEO/GEO Growth Engine', true, 'Higher monthly strategy and content volume', 270, '{"seoGeo":true,"usageBased":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;

insert into public.marketing_os_campaign_blueprints (
  campaign_key, label, plain_goal, prompt_starter, content_types, recommended_outputs_json, minimum_plan_key, sort_order, metadata_json
)
values
  ('ai_search_visibility', 'Check AI Search Visibility', 'See where the business should appear in Google, AI answers, GBP, and community searches.', 'Create an AI search visibility plan for our main service and service area.', array['blog_article','gbp_post','landing_page'], '["Visibility checks","Prompt list","SEO draft","GBP post idea"]'::jsonb, 'free', 5, '{"oneClick":true,"seoGeo":true}'::jsonb),
  ('local_seo_30_day_plan', 'Create 30-Day SEO Plan', 'Plan useful service, city, blog, FAQ, proof, and GBP content without thin auto-publishing.', 'Create a 30-day local SEO plan from our services, service areas, reviews, and proof.', array['blog_article','gbp_post','landing_page','facebook_post'], '["Service page","City page","Blog post","GBP post","Proof post"]'::jsonb, 'starter', 12, '{"oneClick":true,"seoGeo":true}'::jsonb),
  ('authority_builder', 'Build Local Authority', 'Create trust-building tasks from reviews, proof, directories, local citations, internal links, and community presence.', 'Create a local authority plan that avoids spam and uses real customer proof.', array['gbp_post','blog_article','facebook_post','landing_page'], '["Authority tasks","Review proof post","Directory checklist","Internal link plan"]'::jsonb, 'growth', 18, '{"oneClick":true,"seoGeo":true,"noSpam":true}'::jsonb),
  ('reddit_community_visibility', 'Find Community Demand', 'Prepare helpful local/community content ideas from questions people already ask.', 'Create a Reddit and local community visibility plan for our service area.', array['facebook_post','blog_article','gbp_post','ad_copy'], '["Community question list","Helpful answer drafts","Service FAQ","Ad angle ideas"]'::jsonb, 'growth', 24, '{"oneClick":true,"seoGeo":true,"communityVisibility":true}'::jsonb)
on conflict (campaign_key) do update
set label = excluded.label,
    plain_goal = excluded.plain_goal,
    prompt_starter = excluded.prompt_starter,
    content_types = excluded.content_types,
    recommended_outputs_json = excluded.recommended_outputs_json,
    minimum_plan_key = excluded.minimum_plan_key,
    sort_order = excluded.sort_order,
    metadata_json = public.marketing_os_campaign_blueprints.metadata_json || excluded.metadata_json,
    updated_at = now();
