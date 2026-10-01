-- Context-aware lifecycle decisions plus privacy-preserving learning.
-- Customer-specific learning remains tenant-scoped. Cross-tenant contribution
-- is disabled by default and contains aggregate counts only (never messages,
-- contacts, names, or other source records).

create table if not exists public.lifecycle_strategy_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  follow_up_workflow_id uuid not null references public.follow_up_workflows(id) on delete cascade,
  strategy_key text not null,
  segment_key text not null,
  experiment_variant text,
  channel text not null,
  sequence_step integer not null default 1 check (sequence_step > 0),
  prepared boolean not null default true,
  completed boolean not null default false,
  customer_replied boolean not null default false,
  qualified boolean not null default false,
  booked boolean not null default false,
  won boolean not null default false,
  opted_out boolean not null default false,
  attributed_revenue_cents integer not null default 0 check (attributed_revenue_cents >= 0),
  outcome_json jsonb not null default '{}'::jsonb,
  prepared_at timestamptz not null default now(),
  last_measured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, follow_up_workflow_id)
);

create index if not exists lifecycle_strategy_outcomes_learning_idx
  on public.lifecycle_strategy_outcomes(tenant_id, brand_id, strategy_key, last_measured_at desc);

create table if not exists public.cross_tenant_learning_consents (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  status text not null default 'disabled' check (status in ('disabled','enabled','revoked')),
  minimum_cohort_tenants integer not null default 5 check (minimum_cohort_tenants >= 5),
  minimum_cohort_samples integer not null default 50 check (minimum_cohort_samples >= 20),
  consented_by_user_id uuid references public.users(id) on delete set null,
  consented_at timestamptz,
  revoked_at timestamptz,
  policy_version text not null default 'aggregate-growth-v1',
  metadata_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.cross_tenant_learning_contributions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cohort_key text not null,
  strategy_key text not null,
  sample_count integer not null default 0 check (sample_count >= 0),
  reply_count integer not null default 0 check (reply_count >= 0),
  qualified_count integer not null default 0 check (qualified_count >= 0),
  booked_count integer not null default 0 check (booked_count >= 0),
  won_count integer not null default 0 check (won_count >= 0),
  opt_out_count integer not null default 0 check (opt_out_count >= 0),
  revenue_cents bigint not null default 0 check (revenue_cents >= 0),
  period_start date not null,
  period_end date not null,
  metadata_json jsonb not null default '{"containsRawCustomerData":false}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (tenant_id, cohort_key, strategy_key, period_start, period_end)
);

create table if not exists public.aggregate_growth_playbooks (
  id uuid primary key default gen_random_uuid(),
  cohort_key text not null,
  strategy_key text not null,
  contributing_tenants integer not null check (contributing_tenants >= 5),
  sample_count integer not null check (sample_count >= 20),
  reply_rate numeric(8,6),
  qualified_rate numeric(8,6),
  booked_rate numeric(8,6),
  won_rate numeric(8,6),
  opt_out_rate numeric(8,6),
  revenue_per_sample_cents numeric(14,2),
  confidence_score integer not null default 50 check (confidence_score between 0 and 100),
  evidence_window_start date not null,
  evidence_window_end date not null,
  status text not null default 'learning' check (status in ('learning','eligible','retired')),
  metadata_json jsonb not null default '{"deidentified":true}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (cohort_key, strategy_key, evidence_window_start, evidence_window_end)
);

alter table public.lifecycle_strategy_outcomes enable row level security;
alter table public.cross_tenant_learning_consents enable row level security;
alter table public.cross_tenant_learning_contributions enable row level security;
alter table public.aggregate_growth_playbooks enable row level security;

drop policy if exists lifecycle_strategy_outcomes_member on public.lifecycle_strategy_outcomes;
create policy lifecycle_strategy_outcomes_member on public.lifecycle_strategy_outcomes for select
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists cross_tenant_learning_consents_owner on public.cross_tenant_learning_consents;
create policy cross_tenant_learning_consents_owner on public.cross_tenant_learning_consents for all
using (public.has_tenant_role(tenant_id, array['owner','admin']))
with check (public.has_tenant_role(tenant_id, array['owner','admin']));

-- Contributions deliberately have no tenant-member read policy. They are
-- written by the trusted server only and contain aggregate counters only.
-- Published playbooks are readable, but never expose a contributing tenant.
drop policy if exists aggregate_growth_playbooks_authenticated_read on public.aggregate_growth_playbooks;
create policy aggregate_growth_playbooks_authenticated_read on public.aggregate_growth_playbooks for select
using (auth.uid() is not null and status='eligible');

insert into public.cross_tenant_learning_consents (tenant_id, status)
select id, 'disabled' from public.tenants where status <> 'archived'
on conflict (tenant_id) do nothing;
