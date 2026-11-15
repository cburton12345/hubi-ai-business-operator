-- Autonomous maintenance coordination extends the canonical opportunities table.
-- Generic sales opportunities remain untouched until an operator explicitly
-- classifies them as commercial maintenance work.

create table if not exists public.maintenance_operating_policies (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  minimum_margin_bps integer not null default 1500 check (minimum_margin_bps between -10000 and 10000),
  minimum_contribution_cents integer not null default 0,
  maximum_automatic_customer_value_cents integer not null default 250000,
  maximum_automatic_contractor_cost_cents integer not null default 175000,
  maximum_automatic_complexity integer not null default 35 check (maximum_automatic_complexity between 0 and 100),
  manager_escalation_value_cents integer not null default 250000,
  owner_escalation_value_cents integer not null default 1000000,
  auto_sourcing_enabled boolean not null default true,
  auto_work_order_creation_enabled boolean not null default false,
  require_customer_authorization boolean not null default true,
  require_contractor_confirmation boolean not null default true,
  require_insurance_verification boolean not null default true,
  require_license_verification boolean not null default true,
  retry_limit integer not null default 4 check (retry_limit between 1 and 10),
  retry_base_minutes integer not null default 15 check (retry_base_minutes between 1 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maintenance_opportunity_profiles (
  opportunity_id uuid primary key references public.opportunities(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  classification text not null default 'unclassified'
    check (classification in ('unclassified','commercial_maintenance','other_business','non_opportunity')),
  workflow_status text not null default 'received'
    check (workflow_status in (
      'received','needs_information','evaluated','sourcing','recruiting','contractor_identified',
      'contractor_confirmed','ready_for_authorization','accepted','declined','converted','closed'
    )),
  trade text,
  scope text,
  service_address text,
  city text,
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  postal_code text,
  deadline_at timestamptz,
  customer_budget_cents integer check (customer_budget_cents is null or customer_budget_cents >= 0),
  expected_contractor_cost_cents integer check (expected_contractor_cost_cents is null or expected_contractor_cost_cents >= 0),
  materials_allowance_cents integer not null default 0 check (materials_allowance_cents >= 0),
  additional_cost_cents integer not null default 0 check (additional_cost_cents >= 0),
  payment_terms_days integer check (payment_terms_days is null or payment_terms_days between 0 and 365),
  complexity_score integer check (complexity_score is null or complexity_score between 0 and 100),
  callback_risk_score integer check (callback_risk_score is null or callback_risk_score between 0 and 100),
  licensing_requirements jsonb not null default '[]'::jsonb,
  insurance_requirements jsonb not null default '{}'::jsonb,
  licensing_verified boolean not null default false,
  insurance_verified boolean not null default false,
  customer_authorized boolean not null default false,
  contractor_confirmed boolean not null default false,
  marketplacepro_labor_request_id uuid,
  marketplacepro_status text,
  marketplacepro_last_event_at timestamptz,
  work_order_id uuid references public.service_work_orders(id) on delete set null,
  idempotency_key text not null,
  last_evaluated_at timestamptz,
  last_orchestrated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, marketplacepro_labor_request_id),
  unique (tenant_id, work_order_id)
);

create table if not exists public.maintenance_opportunity_evaluations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  classification text not null check (classification in ('suitable','needs_information','unsuitable')),
  gross_contribution_cents integer,
  gross_margin_bps integer,
  risk_score integer not null check (risk_score between 0 and 100),
  blocker_codes jsonb not null default '[]'::jsonb,
  warning_codes jsonb not null default '[]'::jsonb,
  recommended_action text not null,
  policy_snapshot_json jsonb not null default '{}'::jsonb,
  input_snapshot_json jsonb not null default '{}'::jsonb,
  evaluation_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance_orchestration_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  action_type text not null
    check (action_type in ('evaluate','source_contractors','request_recruiting','create_work_order','manager_escalation','owner_escalation')),
  status text not null default 'pending'
    check (status in ('pending','running','succeeded','retry_scheduled','blocked','failed','canceled')),
  idempotency_key text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  retry_after timestamptz,
  safe_error text,
  result_json jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.maintenance_interventions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  work_order_id uuid references public.service_work_orders(id) on delete cascade,
  intervention_level text not null check (intervention_level in ('manager','owner')),
  reason_code text not null,
  summary text not null,
  status text not null default 'open' check (status in ('open','acknowledged','resolved','dismissed')),
  assigned_user_id uuid references public.users(id) on delete set null,
  resolution_minutes integer check (resolution_minutes is null or resolution_minutes >= 0),
  opened_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_profiles_queue_idx
  on public.maintenance_opportunity_profiles (tenant_id, classification, workflow_status, updated_at);
create index if not exists maintenance_profiles_marketplace_idx
  on public.maintenance_opportunity_profiles (tenant_id, marketplacepro_labor_request_id)
  where marketplacepro_labor_request_id is not null;
create index if not exists maintenance_evaluations_history_idx
  on public.maintenance_opportunity_evaluations (tenant_id, opportunity_id, created_at desc);
create index if not exists maintenance_orchestration_retry_idx
  on public.maintenance_orchestration_events (status, retry_after, created_at)
  where status in ('pending','retry_scheduled');
create index if not exists maintenance_interventions_open_idx
  on public.maintenance_interventions (tenant_id, intervention_level, opened_at)
  where status in ('open','acknowledged');

alter table public.maintenance_operating_policies enable row level security;
alter table public.maintenance_opportunity_profiles enable row level security;
alter table public.maintenance_opportunity_evaluations enable row level security;
alter table public.maintenance_orchestration_events enable row level security;
alter table public.maintenance_interventions enable row level security;

-- These operational controls are server-mediated. Browser clients receive no
-- direct Data API privileges; the service role remains available for trusted
-- recovery and integration runtimes while RLS still protects authenticated SQL.
revoke all on table public.maintenance_operating_policies from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.maintenance_operating_policies to service_role;
revoke all on table public.maintenance_opportunity_profiles from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.maintenance_opportunity_profiles to service_role;
revoke all on table public.maintenance_opportunity_evaluations from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.maintenance_opportunity_evaluations to service_role;
revoke all on table public.maintenance_orchestration_events from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.maintenance_orchestration_events to service_role;
revoke all on table public.maintenance_interventions from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.maintenance_interventions to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'maintenance_operating_policies','maintenance_opportunity_profiles',
    'maintenance_opportunity_evaluations','maintenance_orchestration_events','maintenance_interventions'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'',''admin'',''operator'']))',
      table_name || '_tenant_operator', table_name
    );
  end loop;
end $$;

insert into public.maintenance_operating_policies (tenant_id)
select id from public.tenants
on conflict (tenant_id) do nothing;

comment on table public.maintenance_opportunity_profiles is
  'One-to-one maintenance extension of canonical opportunities; never a duplicate opportunity ledger.';
comment on column public.maintenance_operating_policies.auto_work_order_creation_enabled is
  'Fail-closed master gate. Even when true, all customer, contractor, compliance, profitability, and exposure gates must pass.';
