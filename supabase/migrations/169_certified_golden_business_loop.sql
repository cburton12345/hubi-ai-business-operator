-- Durable, evidence-backed orchestration across Ferocity's existing business systems.
-- This does not execute provider actions. Existing authority, consent, routing, and
-- service gates remain the only path to live sends, publishing, calls, and charges.

create table if not exists public.business_loop_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  estimate_id uuid references public.service_estimates(id) on delete set null,
  job_id uuid references public.service_jobs(id) on delete set null,
  invoice_id uuid references public.service_invoices(id) on delete set null,
  mode text not null default 'observed'
    check (mode in ('observed', 'certification', 'live')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'failed', 'dead_lettered', 'canceled')),
  current_stage text not null default 'demand_source_recorded',
  idempotency_key text not null,
  pause_reason text,
  completed_stage_count integer not null default 0 check (completed_stage_count between 0 and 13),
  handoff_gap_count integer not null default 0 check (handoff_gap_count >= 0),
  last_evaluated_at timestamptz,
  completed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.business_loop_stage_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  loop_run_id uuid not null references public.business_loop_runs(id) on delete cascade,
  stage_key text not null check (stage_key in (
    'demand_source_recorded', 'lead_captured', 'lead_qualified', 'estimate_prepared',
    'estimate_accepted', 'work_scheduled', 'work_completed', 'invoice_issued',
    'payment_received', 'margin_recorded', 'review_requested', 'proof_repurposed',
    'growth_restarted'
  )),
  ordinal integer not null check (ordinal between 1 and 13),
  label text not null,
  status text not null default 'waiting_evidence'
    check (status in ('waiting_evidence', 'ready', 'completed', 'blocked', 'failed', 'dead_lettered')),
  idempotency_key text not null,
  blocked_by_stage text,
  handoff_gap boolean not null default false,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz,
  last_error text,
  evidence_json jsonb not null default '{}'::jsonb,
  first_observed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loop_run_id, stage_key),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.business_loop_certifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  certification_key text not null,
  status text not null default 'not_tested'
    check (status in ('not_tested', 'running', 'certified', 'failed', 'expired')),
  loop_run_id uuid references public.business_loop_runs(id) on delete set null,
  passed_stage_count integer not null default 0 check (passed_stage_count between 0 and 13),
  failed_stage_count integer not null default 0 check (failed_stage_count >= 0),
  provider_matrix_json jsonb not null default '{}'::jsonb,
  evidence_json jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  certified_at timestamptz,
  expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, certification_key)
);

create index if not exists idx_business_loop_runs_tenant_status
  on public.business_loop_runs(tenant_id, status, current_stage, updated_at desc);
create index if not exists idx_business_loop_runs_entities
  on public.business_loop_runs(tenant_id, lead_id, job_id, invoice_id);
create index if not exists idx_business_loop_stage_retry
  on public.business_loop_stage_runs(tenant_id, status, next_attempt_at)
  where status in ('failed', 'ready');
create index if not exists idx_business_loop_stage_gaps
  on public.business_loop_stage_runs(tenant_id, handoff_gap, ordinal)
  where handoff_gap;
create index if not exists idx_business_loop_certifications_tenant
  on public.business_loop_certifications(tenant_id, status, updated_at desc);

alter table public.business_loop_runs enable row level security;
alter table public.business_loop_stage_runs enable row level security;
alter table public.business_loop_certifications enable row level security;

drop policy if exists business_loop_runs_tenant_operator on public.business_loop_runs;
create policy business_loop_runs_tenant_operator on public.business_loop_runs
for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists business_loop_stage_runs_tenant_operator on public.business_loop_stage_runs;
create policy business_loop_stage_runs_tenant_operator on public.business_loop_stage_runs
for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists business_loop_certifications_tenant_operator on public.business_loop_certifications;
create policy business_loop_certifications_tenant_operator on public.business_loop_certifications
for select
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

create policy business_loop_certifications_tenant_admin_insert on public.business_loop_certifications
for insert with check (public.has_tenant_role(tenant_id, array['owner','admin']));
create policy business_loop_certifications_tenant_admin_update on public.business_loop_certifications
for update using (public.has_tenant_role(tenant_id, array['owner','admin']))
with check (public.has_tenant_role(tenant_id, array['owner','admin']));
create policy business_loop_certifications_tenant_admin_delete on public.business_loop_certifications
for delete using (public.has_tenant_role(tenant_id, array['owner','admin']));

insert into public.workspace_feature_entitlements (
  tenant_id, feature_key, status, usage_limit, usage_period, metadata_json
)
select
  t.id,
  'certified_business_loop',
  'enabled',
  5000,
  'monthly',
  '{"category":"Operations","description":"Evidence-backed lead-to-growth orchestration and handoff certification.","approvalMode":"inherits_action_policy","plainRule":"Ferocity may coordinate records automatically. Live communication, publishing, calls, and charges still use their existing authority and provider gates.","costed":false,"publicFacing":false}'::jsonb
from public.tenants t
where t.status <> 'archived'
on conflict (tenant_id, feature_key) do update set
  metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
  updated_at = now();
