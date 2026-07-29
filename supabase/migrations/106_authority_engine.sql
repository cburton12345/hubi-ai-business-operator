create table if not exists public.authority_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  score integer not null default 0 check (score between 0 and 100),
  review_score integer not null default 0 check (review_score between 0 and 100),
  project_proof_score integer not null default 0 check (project_proof_score between 0 and 100),
  content_score integer not null default 0 check (content_score between 0 and 100),
  website_score integer not null default 0 check (website_score between 0 and 100),
  consistency_score integer not null default 0 check (consistency_score between 0 and 100),
  explanations_json jsonb not null default '[]'::jsonb,
  missing_signals_json jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_drafts
  drop constraint if exists ai_drafts_content_type_check;

alter table public.ai_drafts
  add constraint ai_drafts_content_type_check
  check (
    content_type in (
      'blog',
      'facebook_post',
      'gbp_post',
      'landing_page',
      'city_page',
      'service_page',
      'google_ad',
      'facebook_ad',
      'email',
      'sms',
      'case_study',
      'faq',
      'video_script',
      'newsletter',
      'internal_training_note',
      'schema_markup',
      'website_recommendation'
    )
  );

alter table public.ai_agent_outputs
  drop constraint if exists ai_agent_outputs_output_type_check;

alter table public.ai_agent_outputs
  add constraint ai_agent_outputs_output_type_check
  check (
    output_type in (
      'internal_email',
      'draft_message',
      'follow_up_workflow',
      'review_workflow',
      'invoice_followup',
      'seo_draft',
      'action_queue',
      'timeline',
      'recommendation',
      'authority_check'
    )
  );

create table if not exists public.authority_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  event_type text not null
    check (event_type in ('job_completed', 'proof_needed', 'asset_created', 'review_requested', 'content_gap_found', 'mention_found', 'community_opportunity_found', 'website_recommendation', 'score_updated', 'manual')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'needs_review', 'approved', 'completed', 'dismissed', 'blocked')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  title text not null,
  summary text,
  recommended_action text,
  source_table text,
  source_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by text not null default 'authority_engine',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.authority_content_bundles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'needs_review'
    check (status in ('draft', 'needs_review', 'approved', 'partially_published', 'published', 'archived')),
  bundle_type text not null default 'completed_job'
    check (bundle_type in ('completed_job', 'review', 'community', 'website_gap', 'manual')),
  title text not null,
  summary text,
  asset_count integer not null default 0 check (asset_count >= 0),
  draft_count integer not null default 0 check (draft_count >= 0),
  queue_count integer not null default 0 check (queue_count >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, job_id, bundle_type)
);

create table if not exists public.authority_content_gaps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  gap_type text not null
    check (gap_type in ('faq', 'service_page', 'location_page', 'blog', 'guide', 'comparison', 'pricing', 'video', 'schema', 'internal_link', 'proof', 'review')),
  status text not null default 'open'
    check (status in ('open', 'planned', 'drafted', 'approved', 'published', 'dismissed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  title text not null,
  why_it_matters text,
  recommended_asset text,
  source_table text,
  source_id uuid,
  ai_draft_id uuid references public.ai_drafts(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.authority_brand_mentions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  mention_source text not null default 'manual',
  mention_url text,
  mention_text text,
  sentiment text not null default 'neutral'
    check (sentiment in ('positive', 'negative', 'neutral', 'question', 'complaint', 'recommendation_request', 'competitor_comparison', 'lead_opportunity')),
  status text not null default 'needs_review'
    check (status in ('needs_review', 'responded', 'dismissed', 'archived')),
  suggested_response text,
  metadata_json jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.authority_community_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  platform text not null,
  opportunity_url text,
  topic text not null,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'approved_response', 'responded_manually', 'dismissed', 'archived')),
  why_it_matters text,
  suggested_response text,
  risk_notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.authority_website_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  recommendation_type text not null
    check (recommendation_type in ('missing_service', 'missing_city', 'weak_page', 'duplicate_content', 'outdated_info', 'broken_link', 'weak_cta', 'internal_link', 'faq', 'schema', 'media', 'conversion')),
  status text not null default 'open'
    check (status in ('open', 'drafted', 'approved', 'published', 'dismissed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  title text not null,
  page_url text,
  recommendation text,
  ai_draft_id uuid references public.ai_drafts(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.authority_knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  article_type text not null default 'project'
    check (article_type in ('project', 'method', 'faq', 'training_note', 'service_note', 'customer_question', 'lesson_learned')),
  status text not null default 'draft'
    check (status in ('draft', 'needs_review', 'approved', 'archived')),
  title text not null,
  body text,
  materials_json jsonb not null default '[]'::jsonb,
  methods_json jsonb not null default '[]'::jsonb,
  questions_json jsonb not null default '[]'::jsonb,
  lessons_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.authority_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  report_period text not null default 'monthly'
    check (report_period in ('daily', 'weekly', 'monthly', 'quarterly', 'manual')),
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'sent', 'archived')),
  title text not null,
  summary text,
  metrics_json jsonb not null default '{}'::jsonb,
  recommendations_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.authority_score_snapshots enable row level security;
alter table public.authority_events enable row level security;
alter table public.authority_content_bundles enable row level security;
alter table public.authority_content_gaps enable row level security;
alter table public.authority_brand_mentions enable row level security;
alter table public.authority_community_opportunities enable row level security;
alter table public.authority_website_recommendations enable row level security;
alter table public.authority_knowledge_articles enable row level security;
alter table public.authority_reports enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'authority_score_snapshots',
    'authority_events',
    'authority_content_bundles',
    'authority_content_gaps',
    'authority_brand_mentions',
    'authority_community_opportunities',
    'authority_website_recommendations',
    'authority_knowledge_articles',
    'authority_reports'
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

create index if not exists authority_score_snapshots_tenant_idx
  on public.authority_score_snapshots(tenant_id, brand_id, calculated_at desc);
create index if not exists authority_events_tenant_idx
  on public.authority_events(tenant_id, status, priority, created_at desc);
create index if not exists authority_events_job_idx
  on public.authority_events(tenant_id, job_id, event_type);
create index if not exists authority_content_bundles_tenant_idx
  on public.authority_content_bundles(tenant_id, status, created_at desc);
create index if not exists authority_content_gaps_tenant_idx
  on public.authority_content_gaps(tenant_id, status, priority, created_at desc);
create index if not exists authority_brand_mentions_tenant_idx
  on public.authority_brand_mentions(tenant_id, status, sentiment, discovered_at desc);
create index if not exists authority_community_opps_tenant_idx
  on public.authority_community_opportunities(tenant_id, status, discovered_at desc);
create index if not exists authority_website_recs_tenant_idx
  on public.authority_website_recommendations(tenant_id, status, priority, created_at desc);
create index if not exists authority_knowledge_articles_tenant_idx
  on public.authority_knowledge_articles(tenant_id, status, created_at desc);

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select
  t.id,
  'authority_engine',
  'enabled',
  250,
  'monthly',
  '{"category":"Authority","description":"Completed-job authority work, proof-to-content drafts, review requests, website recommendations, and reputation opportunities.","approvalMode":"review_required","overagePolicy":"allow_with_review","plainRule":"Turn real work into review-ready authority assets. Never publish or respond without approval.","costed":true,"publicFacing":true}'::jsonb
from public.tenants t
on conflict (tenant_id, feature_key) do update
set status = excluded.status,
    usage_limit = coalesce(public.workspace_feature_entitlements.usage_limit, excluded.usage_limit),
    usage_period = coalesce(public.workspace_feature_entitlements.usage_period, excluded.usage_period),
    metadata_json = excluded.metadata_json || public.workspace_feature_entitlements.metadata_json,
    updated_at = now();

insert into public.plan_feature_matrix (plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json)
values
  ('free', 'authority_engine', 'Authority Engine', true, 'Manual proof and review checklist', 152, '{"authority":true,"reviewRequired":true}'::jsonb),
  ('starter', 'authority_engine', 'Authority Engine', true, 'Completed-job proof and review drafts', 152, '{"authority":true,"reviewRequired":true}'::jsonb),
  ('growth', 'authority_engine', 'Authority Engine Plus', true, 'Proof-to-content bundles and publishing queue', 152, '{"authority":true,"reviewRequired":true}'::jsonb),
  ('operator', 'authority_engine', 'Authority Manager', true, 'Advanced authority monitoring and reporting', 152, '{"authority":true,"reviewRequired":true}'::jsonb),
  ('managed_operator', 'authority_engine', 'Managed Authority Manager', true, 'Managed proof, content, review, and reputation work', 152, '{"authority":true,"managedService":true,"reviewRequired":true}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json;
