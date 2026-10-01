-- Add the missing objective/economics/controller layer to the existing Growth,
-- Revenue Growth, Content Studio, attribution, proof, and automation systems.
-- This migration intentionally extends those systems instead of replacing them.

alter table public.growth_objectives
  add column if not exists target_collected_revenue_cents integer check (target_collected_revenue_cents is null or target_collected_revenue_cents >= 0),
  add column if not exists target_gross_profit_cents integer check (target_gross_profit_cents is null or target_gross_profit_cents >= 0),
  add column if not exists average_job_value_cents integer check (average_job_value_cents is null or average_job_value_cents > 0),
  add column if not exists cost_per_lead_cents integer check (cost_per_lead_cents is null or cost_per_lead_cents >= 0),
  add column if not exists gross_margin_target_bps integer check (gross_margin_target_bps is null or gross_margin_target_bps between 0 and 10000),
  add column if not exists minimum_gross_margin_bps integer check (minimum_gross_margin_bps is null or minimum_gross_margin_bps between 0 and 10000),
  add column if not exists maximum_cac_cents integer check (maximum_cac_cents is null or maximum_cac_cents >= 0),
  add column if not exists minimum_roas_milli integer check (minimum_roas_milli is null or minimum_roas_milli >= 0),
  add column if not exists monthly_job_capacity integer check (monthly_job_capacity is null or monthly_job_capacity >= 0),
  add column if not exists maximum_backlog_jobs integer check (maximum_backlog_jobs is null or maximum_backlog_jobs >= 0),
  add column if not exists service_mix_json jsonb not null default '[]'::jsonb,
  add column if not exists capacity_constraints_json jsonb not null default '{}'::jsonb,
  add column if not exists economic_constraints_json jsonb not null default '{}'::jsonb;

create table if not exists public.growth_icp_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  customer_type text,
  firmographics_json jsonb not null default '{}'::jsonb,
  demographics_json jsonb not null default '{}'::jsonb,
  geography_json jsonb not null default '{}'::jsonb,
  pains_json jsonb not null default '[]'::jsonb,
  desired_outcomes_json jsonb not null default '[]'::jsonb,
  buying_triggers_json jsonb not null default '[]'::jsonb,
  objections_json jsonb not null default '[]'::jsonb,
  disqualifiers_json jsonb not null default '[]'::jsonb,
  evidence_json jsonb not null default '[]'::jsonb,
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  sample_size integer not null default 0 check (sample_size >= 0),
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, name)
);

create table if not exists public.growth_ideal_job_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  service_keys text[] not null default array[]::text[],
  minimum_value_cents integer check (minimum_value_cents is null or minimum_value_cents >= 0),
  maximum_value_cents integer check (maximum_value_cents is null or maximum_value_cents >= 0),
  minimum_margin_bps integer check (minimum_margin_bps is null or minimum_margin_bps between 0 and 10000),
  geography_json jsonb not null default '{}'::jsonb,
  capacity_requirements_json jsonb not null default '{}'::jsonb,
  qualification_rules_json jsonb not null default '[]'::jsonb,
  disqualifiers_json jsonb not null default '[]'::jsonb,
  evidence_json jsonb not null default '[]'::jsonb,
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, name)
);

create table if not exists public.growth_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  icp_profile_id uuid references public.growth_icp_profiles(id) on delete set null,
  ideal_job_profile_id uuid references public.growth_ideal_job_profiles(id) on delete set null,
  previous_version_id uuid references public.growth_offers(id) on delete set null,
  offer_key text not null,
  version integer not null default 1 check (version > 0),
  name text not null,
  promise text not null,
  mechanism text,
  included_json jsonb not null default '[]'::jsonb,
  exclusions_json jsonb not null default '[]'::jsonb,
  proof_requirements_json jsonb not null default '[]'::jsonb,
  price_floor_cents integer check (price_floor_cents is null or price_floor_cents >= 0),
  price_ceiling_cents integer check (price_ceiling_cents is null or price_ceiling_cents >= 0),
  minimum_margin_bps integer check (minimum_margin_bps is null or minimum_margin_bps between 0 and 10000),
  capacity_cost_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','active','testing','paused','retired','archived')),
  valid_from timestamptz,
  valid_until timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, brand_id, offer_key, version)
);

create table if not exists public.growth_voc_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  source_type text not null check (source_type in ('call','email','sms','chat','review','survey','estimate','job','invoice','manual','other')),
  source_table text,
  source_id text,
  signal_type text not null check (signal_type in ('pain','desired_outcome','objection','buying_trigger','customer_language','won_reason','lost_reason','trust_signal','competitor','other')),
  verbatim_excerpt text,
  normalized_summary text not null,
  tags text[] not null default array[]::text[],
  confidence_score integer not null default 50 check (confidence_score between 0 and 100),
  evidence_json jsonb not null default '[]'::jsonb,
  observed_at timestamptz not null default now(),
  expires_at timestamptz,
  review_status text not null default 'learning' check (review_status in ('learning','verified','rejected','expired','archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_controller_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  objective_id uuid not null references public.growth_objectives(id) on delete cascade,
  directive text not null check (directive in ('expand','hold','constrain','repair_data')),
  target_gap_cents integer not null default 0,
  data_health_score integer not null default 0 check (data_health_score between 0 and 100),
  capacity_json jsonb not null default '{}'::jsonb,
  economics_json jsonb not null default '{}'::jsonb,
  reverse_plan_json jsonb not null default '{}'::jsonb,
  reasons_json jsonb not null default '[]'::jsonb,
  evidence_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.marketing_ad_experiments
  add column if not exists hypothesis text,
  add column if not exists primary_metric text,
  add column if not exists secondary_metrics text[] not null default array[]::text[],
  add column if not exists guardrail_metrics text[] not null default array[]::text[],
  add column if not exists minimum_observation_count integer not null default 0 check (minimum_observation_count >= 0),
  add column if not exists minimum_observation_hours integer not null default 0 check (minimum_observation_hours >= 0),
  add column if not exists decision_status text not null default 'not_ready'
    check (decision_status in ('not_ready','keep_running','winner','loser','inconclusive','stopped'));

alter table public.marketing_creative_variants
  add column if not exists parent_variant_id uuid references public.marketing_creative_variants(id) on delete set null,
  add column if not exists concept_key text,
  add column if not exists lifecycle_status text not null default 'new'
    check (lifecycle_status in ('new','testing','promising','winner','fatiguing','retired','archived')),
  add column if not exists fatigue_score integer not null default 0 check (fatigue_score between 0 and 100),
  add column if not exists last_performance_at timestamptz;

create index if not exists growth_icp_profiles_active_idx on public.growth_icp_profiles(tenant_id,brand_id,status,updated_at desc);
create index if not exists growth_ideal_job_profiles_active_idx on public.growth_ideal_job_profiles(tenant_id,brand_id,status,updated_at desc);
create index if not exists growth_offers_active_idx on public.growth_offers(tenant_id,brand_id,status,updated_at desc);
create index if not exists growth_voc_signals_learning_idx on public.growth_voc_signals(tenant_id,brand_id,signal_type,review_status,observed_at desc);
create index if not exists growth_controller_snapshots_recent_idx on public.growth_controller_snapshots(tenant_id,brand_id,objective_id,generated_at desc);
create index if not exists marketing_creative_variants_lineage_idx on public.marketing_creative_variants(tenant_id,parent_variant_id,lifecycle_status);

alter table public.growth_icp_profiles enable row level security;
alter table public.growth_ideal_job_profiles enable row level security;
alter table public.growth_offers enable row level security;
alter table public.growth_voc_signals enable row level security;
alter table public.growth_controller_snapshots enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['growth_icp_profiles','growth_ideal_job_profiles','growth_offers','growth_voc_signals','growth_controller_snapshots']
  loop
    execute format('drop policy if exists %I_tenant_operator on public.%I', table_name, table_name);
    execute format('create policy %I_tenant_operator on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))', table_name, table_name);
  end loop;
end $$;

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select tenant.id, 'closed_loop_growth_controller', 'enabled', null, 'monthly',
  '{"category":"Growth","description":"Evidence-backed goal-to-revenue planning, capacity protection and closed-loop growth direction.","approvalMode":"risk_based","plainRule":"Ferocity may analyze and recommend. It never increases paid spend without explicit authority.","costed":false,"publicFacing":true}'::jsonb
from public.tenants tenant where tenant.status <> 'archived'
on conflict (tenant_id,feature_key) do update set metadata_json=excluded.metadata_json,updated_at=now();

-- Reconcile the public plan promise with provisioning for future workspaces.
-- Higher plans inherit the same engine with progressively more autonomous use;
-- this does not create separate implementations per tier.
insert into public.plan_feature_matrix
  (plan_key,feature_key,feature_label,included,limit_label,sort_order,metadata_json)
select mapping.plan_key,'closed_loop_growth_controller','Goal-to-profit Growth planning',true,mapping.limit_label,242,
  jsonb_build_object('sharedEngine',true,'paidSpendRequiresApproval',true,'level',mapping.level)
from (values
  ('starter','Objective, bottleneck, and assumption-aware first plan','guided'),
  ('growth','Closed-loop collected-cash, funnel, margin, and capacity planning','managed'),
  ('operator','Proactive expand, hold, constrain, and data-repair direction','proactive'),
  ('managed_operator','Managed closed-loop growth direction','managed_service'),
  ('pro_agency','Multi-brand closed-loop growth direction','multi_brand')
) mapping(plan_key,limit_label,level)
join public.billing_plans plan on plan.plan_key=mapping.plan_key
on conflict (plan_key,feature_key) do update set
  feature_label=excluded.feature_label,included=true,limit_label=excluded.limit_label,sort_order=excluded.sort_order,
  metadata_json=public.plan_feature_matrix.metadata_json || excluded.metadata_json,updated_at=now();

insert into public.plan_feature_matrix
  (plan_key,feature_key,feature_label,included,limit_label,sort_order,metadata_json)
select mapping.plan_key,'expense_document_intelligence','Receipt, bill, and statement intelligence',true,mapping.limit_label,146,
  jsonb_build_object('sharedEngine',true,'originalSourcePreserved',true,'reviewFirst',true,'batchIntake',true)
from (values
  ('job_tracker','Photo, upload, batch, and email intake with review'),
  ('starter','Photo, upload, batch, and email intake with review'),
  ('growth','Expense intelligence connected to jobs, money, and profitability'),
  ('operator','Expense intelligence with proactive cost and profitability monitoring'),
  ('managed_operator','Managed expense intelligence and review'),
  ('pro_agency','Multi-brand expense intelligence')
) mapping(plan_key,limit_label)
join public.billing_plans plan on plan.plan_key=mapping.plan_key
on conflict (plan_key,feature_key) do update set
  feature_label=excluded.feature_label,included=true,limit_label=excluded.limit_label,sort_order=excluded.sort_order,
  metadata_json=public.plan_feature_matrix.metadata_json || excluded.metadata_json,updated_at=now();

insert into public.workspace_feature_entitlements (tenant_id,feature_key,status,usage_limit,usage_period,metadata_json)
select subscription.tenant_id,'expense_document_intelligence','enabled',null,'monthly',
  jsonb_build_object('category','Money','description','Receipt, bill, warranty, and statement intelligence with traceable originals and review-first posting.','provisionedFromPlan',subscription.plan_key,'batchIntake',true,'reviewFirst',true)
from public.billing_subscriptions subscription
where subscription.status in ('trialing','active','past_due','manual','incomplete')
  and subscription.plan_key in ('job_tracker','starter','growth','operator','managed_operator','pro_agency')
on conflict (tenant_id,feature_key) do update set
  status=case when public.workspace_feature_entitlements.status='disabled' then public.workspace_feature_entitlements.status else 'enabled' end,
  metadata_json=public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,updated_at=now();
