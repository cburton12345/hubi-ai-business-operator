create table if not exists public.authority_backlinks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  source_url text not null,
  source_domain text not null,
  target_url text not null,
  anchor_text text,
  rel_attributes text[] not null default '{}',
  link_type text not null default 'unknown'
    check (link_type in ('earned', 'editorial', 'directory', 'supplier', 'manufacturer', 'association', 'local_media', 'partner', 'customer_story', 'sponsorship', 'manual', 'unknown')),
  status text not null default 'unverified'
    check (status in ('unverified', 'active', 'lost', 'suspicious', 'ignored')),
  domain_rating integer check (domain_rating between 0 and 100),
  relevance_score integer not null default 50 check (relevance_score between 0 and 100),
  quality_score integer not null default 0 check (quality_score between 0 and 100),
  risk_level text not null default 'medium'
    check (risk_level in ('low', 'medium', 'high')),
  referral_visits integer not null default 0 check (referral_visits >= 0),
  attributed_leads integer not null default 0 check (attributed_leads >= 0),
  attributed_revenue_cents integer not null default 0 check (attributed_revenue_cents >= 0),
  estimated_market_value_cents integer not null default 0 check (estimated_market_value_cents >= 0),
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  lost_at timestamptz,
  risk_flags_json jsonb not null default '[]'::jsonb,
  evidence_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source_url, target_url)
);

create table if not exists public.authority_linkable_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  ai_draft_id uuid references public.ai_drafts(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete set null,
  knowledge_article_id uuid references public.authority_knowledge_articles(id) on delete set null,
  asset_type text not null
    check (asset_type in ('case_study', 'project_gallery', 'cost_guide', 'checklist', 'calculator', 'local_guide', 'comparison', 'original_data', 'faq', 'resource')),
  title text not null,
  public_url text,
  status text not null default 'idea'
    check (status in ('idea', 'needs_proof', 'draft', 'approved', 'published', 'retired')),
  usefulness_score integer not null default 50 check (usefulness_score between 0 and 100),
  originality_score integer not null default 50 check (originality_score between 0 and 100),
  evidence_summary text,
  recommended_next_action text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists authority_linkable_assets_draft_unique
  on public.authority_linkable_assets (tenant_id, ai_draft_id)
  where ai_draft_id is not null;

create unique index if not exists authority_linkable_assets_job_unique
  on public.authority_linkable_assets (tenant_id, job_id, asset_type)
  where job_id is not null;

create unique index if not exists authority_linkable_assets_knowledge_unique
  on public.authority_linkable_assets (tenant_id, knowledge_article_id)
  where knowledge_article_id is not null;

create table if not exists public.authority_link_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  asset_id uuid references public.authority_linkable_assets(id) on delete set null,
  opportunity_type text not null default 'manual'
    check (opportunity_type in ('supplier_directory', 'manufacturer_installer', 'chamber', 'association', 'local_media', 'resource_page', 'partner', 'customer_story', 'sponsorship', 'digital_pr', 'manual')),
  organization_name text not null,
  opportunity_url text,
  opportunity_domain text,
  target_url text,
  status text not null default 'discovered'
    check (status in ('discovered', 'qualified', 'asset_needed', 'ready_for_outreach', 'contacted_manually', 'earned', 'dismissed')),
  relevance_score integer not null default 50 check (relevance_score between 0 and 100),
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high', 'verified')),
  risk_level text not null default 'low'
    check (risk_level in ('low', 'medium', 'high')),
  recommended_asset text,
  recommended_action text,
  relationship_evidence text,
  outreach_draft text,
  outreach_mode text not null default 'manual_or_owner_authorized'
    check (outreach_mode in ('manual_or_owner_authorized', 'manual_only')),
  metadata_json jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists authority_link_opportunity_org_unique
  on public.authority_link_opportunities (
    tenant_id,
    opportunity_type,
    lower(organization_name),
    coalesce(opportunity_domain, '')
  );

create index if not exists authority_backlinks_status_idx
  on public.authority_backlinks (tenant_id, status, risk_level, updated_at desc);

create index if not exists authority_link_assets_status_idx
  on public.authority_linkable_assets (tenant_id, status, updated_at desc);

create index if not exists authority_link_opportunities_status_idx
  on public.authority_link_opportunities (tenant_id, status, relevance_score desc, updated_at desc);

alter table public.authority_backlinks enable row level security;
alter table public.authority_linkable_assets enable row level security;
alter table public.authority_link_opportunities enable row level security;

drop policy if exists authority_backlinks_tenant_operator on public.authority_backlinks;
create policy authority_backlinks_tenant_operator
on public.authority_backlinks
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists authority_linkable_assets_tenant_operator on public.authority_linkable_assets;
create policy authority_linkable_assets_tenant_operator
on public.authority_linkable_assets
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists authority_link_opportunities_tenant_operator on public.authority_link_opportunities;
create policy authority_link_opportunities_tenant_operator
on public.authority_link_opportunities
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.plan_feature_matrix (
  plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json
)
values
  ('growth', 'authority_link_intelligence', 'Link Authority Intelligence', true, 'Backlink health, linkable assets, legitimate opportunities, and ROI', 226, '{"authority":true,"seoGeo":true,"reviewRequired":false}'::jsonb),
  ('operator', 'authority_link_intelligence', 'Link Authority Command', true, 'Cross-brand monitoring, loss/risk signals, opportunities, and revenue attribution', 326, '{"authority":true,"seoGeo":true,"reviewRequired":false}'::jsonb)
on conflict (plan_key, feature_key) do update
set feature_label = excluded.feature_label,
    included = excluded.included,
    limit_label = excluded.limit_label,
    sort_order = excluded.sort_order,
    metadata_json = public.plan_feature_matrix.metadata_json || excluded.metadata_json,
    updated_at = now();

insert into public.workspace_feature_entitlements (
  tenant_id, feature_key, status, usage_limit, usage_period, metadata_json, updated_at
)
select
  id,
  'authority_link_intelligence',
  'enabled',
  null,
  'monthly',
  '{"category":"Authority","description":"Backlink health, earned-link opportunities, linkable assets, and real ROI tracking","approvalMode":"enabled","overagePolicy":"allow","plainRule":"Monitor links and prepare legitimate opportunities. Never create an automated reciprocal-link network or send outreach without channel authority.","costed":false,"publicFacing":false}'::jsonb,
  now()
from public.tenants
on conflict (tenant_id, feature_key) do update
set status = 'enabled',
    usage_limit = null,
    metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
    updated_at = now();
