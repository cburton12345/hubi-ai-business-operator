-- Compose the existing Marketing OS, Growth Department, SEO/GEO, Publishing,
-- Local Presence and attribution systems. This is connective infrastructure,
-- not a parallel marketing product.

create table if not exists public.marketing_playbooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  playbook_key text not null,
  name text not null,
  purpose text not null,
  category text not null,
  status text not null default 'active' check (status in ('draft','active','paused','retired','archived')),
  current_version integer not null default 1 check (current_version > 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, playbook_key)
);

create table if not exists public.marketing_playbook_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  playbook_id uuid not null references public.marketing_playbooks(id) on delete cascade,
  version integer not null check (version > 0),
  required_context_json jsonb not null default '[]'::jsonb,
  workflow_json jsonb not null default '[]'::jsonb,
  decision_rules_json jsonb not null default '[]'::jsonb,
  outputs_json jsonb not null default '[]'::jsonb,
  quality_checks_json jsonb not null default '[]'::jsonb,
  success_metrics_json jsonb not null default '[]'::jsonb,
  permissions_json jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('draft','active','retired')),
  created_at timestamptz not null default now(),
  unique (tenant_id, playbook_id, version)
);

create table if not exists public.marketing_playbook_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  objective_id uuid references public.growth_objectives(id) on delete set null,
  playbook_version_id uuid not null references public.marketing_playbook_versions(id) on delete restrict,
  parent_run_id uuid references public.marketing_playbook_runs(id) on delete set null,
  status text not null default 'planned' check (status in ('planned','running','needs_approval','blocked','completed','measuring','failed','canceled')),
  input_snapshot_json jsonb not null default '{}'::jsonb,
  plan_json jsonb not null default '[]'::jsonb,
  output_references_json jsonb not null default '[]'::jsonb,
  quality_result_json jsonb not null default '{}'::jsonb,
  outcome_json jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.marketing_brain_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  version integer not null check (version > 0),
  truth_json jsonb not null default '{}'::jsonb,
  source_freshness_json jsonb not null default '{}'::jsonb,
  missing_context_json jsonb not null default '[]'::jsonb,
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, brand_id, version)
);

create table if not exists public.seo_growth_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  status text not null default 'audited' check (status in ('audited','prioritized','fixing','measuring','learned','blocked','failed')),
  audit_json jsonb not null default '{}'::jsonb,
  priorities_json jsonb not null default '[]'::jsonb,
  executed_actions_json jsonb not null default '[]'::jsonb,
  measurements_json jsonb not null default '{}'::jsonb,
  learning_json jsonb not null default '{}'::jsonb,
  next_run_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_search_visibility_observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  visibility_check_id uuid not null references public.ai_search_visibility_checks(id) on delete cascade,
  provider_key text not null,
  status text not null default 'observed' check (status in ('observed','needs_review','provider_unavailable','failed')),
  business_mentioned boolean,
  description_text text,
  competitor_mentions_json jsonb not null default '[]'::jsonb,
  citations_json jsonb not null default '[]'::jsonb,
  inaccuracies_json jsonb not null default '[]'::jsonb,
  content_gaps_json jsonb not null default '[]'::jsonb,
  raw_response_hash text,
  observed_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_search_visibility_checks
  add column if not exists question_class text,
  add column if not exists service_focus text,
  add column if not exists geography_text text,
  add column if not exists cadence_days integer not null default 30 check (cadence_days between 1 and 365),
  add column if not exists latest_observation_id uuid references public.ai_search_visibility_observations(id) on delete set null;

alter table public.growth_opportunities
  add column if not exists source_category text,
  add column if not exists impact_score integer not null default 0 check (impact_score between 0 and 100),
  add column if not exists relevance_score integer not null default 0 check (relevance_score between 0 and 100),
  add column if not exists effort_score integer not null default 50 check (effort_score between 0 and 100),
  add column if not exists confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  add column if not exists urgency_score integer not null default 0 check (urgency_score between 0 and 100),
  add column if not exists business_value_score integer not null default 0 check (business_value_score between 0 and 100),
  add column if not exists recommended_playbook_key text;

alter table public.growth_attribution_touches
  add column if not exists qualified boolean not null default false,
  add column if not exists booked boolean not null default false,
  add column if not exists work_completed boolean not null default false,
  add column if not exists collected_revenue_cents integer not null default 0,
  add column if not exists gross_profit_cents integer,
  add column if not exists review_created boolean not null default false,
  add column if not exists repeat_customer boolean not null default false,
  add column if not exists referral_customer boolean not null default false;

create index if not exists marketing_playbook_runs_queue_idx on public.marketing_playbook_runs(tenant_id,status,created_at desc);
create index if not exists marketing_brain_snapshots_latest_idx on public.marketing_brain_snapshots(tenant_id,brand_id,version desc);
create index if not exists seo_growth_cycles_queue_idx on public.seo_growth_cycles(tenant_id,brand_id,status,next_run_at);
create index if not exists ai_search_observations_history_idx on public.ai_search_visibility_observations(tenant_id,visibility_check_id,observed_at desc);
create index if not exists growth_opportunities_business_value_idx on public.growth_opportunities(tenant_id,status,business_value_score desc,detected_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array['marketing_playbooks','marketing_playbook_versions','marketing_playbook_runs','marketing_brain_snapshots','seo_growth_cycles','ai_search_visibility_observations']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))',
      table_name || '_tenant_operator', table_name
    );
  end loop;
end $$;

insert into public.workspace_feature_entitlements (tenant_id,feature_key,status,usage_limit,usage_period,metadata_json)
select t.id,'composable_growth_intelligence','enabled',null,'monthly',
  '{"category":"Growth","description":"Versioned marketing playbooks, shared business truth, continuous SEO/GEO cycles, business-value opportunity scoring and source-to-profit learning.","approvalMode":"risk_based","publicFacing":true}'::jsonb
from public.tenants t where t.status <> 'archived'
on conflict (tenant_id,feature_key) do update set metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,updated_at=now();
