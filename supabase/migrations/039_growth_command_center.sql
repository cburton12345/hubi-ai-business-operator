create table if not exists public.seo_page_opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  opportunity_type text not null
    check (opportunity_type in ('create_city_service_page', 'refresh_existing_page', 'add_internal_links', 'improve_conversion', 'add_local_proof', 'fix_thin_content')),
  page_type text not null
    check (page_type in ('service_page', 'city_page', 'blog', 'landing_page', 'gbp_post', 'other')),
  title text not null,
  target_keyword text,
  service_focus text,
  city_focus text,
  current_url text,
  target_url text,
  priority_score integer not null default 50 check (priority_score between 0 and 100),
  status text not null default 'open'
    check (status in ('open', 'planned', 'draft_created', 'in_review', 'published_manually', 'paused', 'done', 'dismissed')),
  reason text not null,
  next_step text not null,
  source_metric_snapshot_id uuid references public.external_metric_snapshots(id) on delete set null,
  draft_id uuid references public.ai_drafts(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_conversion_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  target_key text not null,
  label text not null,
  source_family text not null
    check (source_family in ('organic', 'gbp', 'paid', 'email', 'sms', 'referral', 'direct', 'manual', 'unknown')),
  target_type text not null
    check (target_type in ('lead', 'booked_job', 'revenue', 'review', 'call', 'form_submission')),
  target_value numeric(14,2) not null default 0,
  period text not null default 'monthly'
    check (period in ('weekly', 'monthly', 'quarterly')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, target_key)
);

create index if not exists idx_seo_page_opportunities_tenant_status
  on public.seo_page_opportunities(tenant_id, status, priority_score desc, detected_at desc);

create index if not exists idx_seo_page_opportunities_brand
  on public.seo_page_opportunities(tenant_id, brand_id, opportunity_type, status);

create unique index if not exists idx_seo_page_opportunities_unique_open
  on public.seo_page_opportunities(
    tenant_id,
    brand_id,
    opportunity_type,
    page_type,
    title,
    coalesce(target_keyword, ''),
    coalesce(city_focus, ''),
    coalesce(service_focus, '')
  );

create index if not exists idx_marketing_conversion_targets_tenant
  on public.marketing_conversion_targets(tenant_id, status, source_family, target_type);

alter table public.growth_operator_insights
  drop constraint if exists growth_operator_insights_insight_type_check;

alter table public.growth_operator_insights
  add constraint growth_operator_insights_insight_type_check
  check (insight_type in (
    'content_quality',
    'lead_recovery',
    'seo_compounding',
    'review_flow',
    'conversion_tracking',
    'revenue_attribution',
    'publishing_consistency',
    'invoice_followup'
  ));

alter table public.seo_page_opportunities enable row level security;
alter table public.marketing_conversion_targets enable row level security;

drop policy if exists seo_page_opportunities_tenant_operator on public.seo_page_opportunities;
create policy seo_page_opportunities_tenant_operator
on public.seo_page_opportunities
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists marketing_conversion_targets_tenant_operator on public.marketing_conversion_targets;
create policy marketing_conversion_targets_tenant_operator
on public.marketing_conversion_targets
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
