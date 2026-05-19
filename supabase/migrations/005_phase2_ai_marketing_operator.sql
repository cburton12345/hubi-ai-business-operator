alter table public.brand_marketing_settings
  add column if not exists auto_create_low_risk_drafts boolean not null default true,
  add column if not exists auto_weekly_seo_posts boolean not null default true,
  add column if not exists auto_gbp_post_drafts boolean not null default true,
  add column if not exists auto_facebook_post_drafts boolean not null default true,
  add column if not exists auto_review_request_drafts boolean not null default true,
  add column if not exists auto_follow_up_drafts boolean not null default true,
  add column if not exists auto_landing_page_suggestions boolean not null default true,
  add column if not exists high_risk_approval_rules jsonb not null default '{
    "publishingLive": true,
    "adBudgetChanges": true,
    "legalSensitiveClaims": true,
    "pricingChanges": true,
    "majorHomepageChanges": true,
    "deletingPages": true,
    "publicReviewResponses": true
  }'::jsonb;

create table if not exists public.brand_landing_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  title text not null,
  slug text not null,
  url text,
  page_type text not null default 'landing_page'
    check (page_type in ('landing_page', 'city_page', 'service_page', 'homepage', 'other')),
  primary_keyword text,
  status text not null default 'planned'
    check (status in ('planned', 'draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, slug)
);

create table if not exists public.brand_seo_keywords (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  keyword text not null,
  intent text not null default 'service'
    check (intent in ('service', 'local', 'comparison', 'education', 'brand', 'commercial')),
  priority integer not null default 0,
  target_url text,
  created_at timestamptz not null default now(),
  unique (brand_id, keyword)
);

create table if not exists public.marketing_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  period_key text not null,
  status text not null default 'ready'
    check (status in ('draft', 'ready', 'approved', 'archived')),
  summary text,
  plan_json jsonb not null default '{}'::jsonb,
  generated_by text not null default 'system'
    check (generated_by in ('system', 'ai', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, period_key)
);

create table if not exists public.marketing_calendar_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  source_type text not null default 'manual'
    check (source_type in ('ai_draft', 'recommendation', 'ai_task', 'marketing_plan', 'manual')),
  source_id uuid,
  title text not null,
  item_type text not null
    check (
      item_type in (
        'seo_blog',
        'facebook_post',
        'gbp_post',
        'landing_page',
        'city_page',
        'service_page',
        'google_ad',
        'facebook_ad',
        'review_request',
        'lead_followup',
        'recommendation',
        'task'
      )
    ),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'approved', 'published', 'rejected', 'upcoming')),
  scheduled_for timestamptz,
  published_at timestamptz,
  risk_level text not null default 'low'
    check (risk_level in ('low', 'medium', 'high')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_intelligence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  summary text not null,
  urgency text not null default 'normal'
    check (urgency in ('low', 'normal', 'high')),
  likely_spam boolean not null default false,
  suggested_service text,
  suggested_category text,
  suggested_next_action text,
  draft_reply text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (lead_id)
);

create index if not exists idx_brand_landing_pages_brand on public.brand_landing_pages(tenant_id, brand_id, status);
create index if not exists idx_brand_seo_keywords_brand on public.brand_seo_keywords(tenant_id, brand_id, priority desc);
create index if not exists idx_marketing_plans_brand_period on public.marketing_plans(tenant_id, brand_id, period_key);
create index if not exists idx_marketing_calendar_status on public.marketing_calendar_items(tenant_id, brand_id, status, scheduled_for);
create index if not exists idx_lead_intelligence_lead on public.lead_intelligence(tenant_id, lead_id);

alter table public.brand_landing_pages enable row level security;
alter table public.brand_seo_keywords enable row level security;
alter table public.marketing_plans enable row level security;
alter table public.marketing_calendar_items enable row level security;
alter table public.lead_intelligence enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'brand_landing_pages',
    'brand_seo_keywords',
    'marketing_plans',
    'marketing_calendar_items',
    'lead_intelligence'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_read_by_tenant_member', table_name);
    execute format(
      'create policy %I on public.%I for select using (public.has_tenant_access(tenant_id))',
      table_name || '_read_by_tenant_member',
      table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || '_write_by_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_write_by_tenant_operator',
      table_name
    );
  end loop;
end $$;
