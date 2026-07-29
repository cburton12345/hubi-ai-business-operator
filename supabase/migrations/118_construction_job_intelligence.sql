create table if not exists public.construction_daily_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_job_id uuid not null references public.service_jobs(id) on delete cascade,
  assignment_id uuid references public.operations_assignments(id) on delete set null,
  log_date date not null default current_date,
  raw_note text not null,
  summary text not null,
  progress_summary text,
  delay_summary text,
  material_summary text,
  safety_summary text,
  conflict_summary text,
  weather_summary text,
  customer_update_draft text,
  status text not null default 'needs_review'
    check (status in ('draft', 'needs_review', 'approved', 'rejected', 'archived')),
  confidence text not null default 'medium'
    check (confidence in ('low', 'medium', 'high')),
  risk_flags_json jsonb not null default '[]'::jsonb,
  suggested_actions_json jsonb not null default '[]'::jsonb,
  evidence_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.construction_job_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_job_id uuid not null references public.service_jobs(id) on delete cascade,
  health_status text not null
    check (health_status in ('on_track', 'needs_information', 'money_risk', 'schedule_risk', 'procurement_risk', 'safety_risk', 'needs_attention')),
  severity text not null default 'low'
    check (severity in ('low', 'medium', 'high', 'critical')),
  project_value_cents integer not null default 0,
  tracked_cost_cents integer not null default 0,
  invoiced_cents integer not null default 0,
  paid_cents integer not null default 0,
  open_risk_count integer not null default 0,
  risk_items_json jsonb not null default '[]'::jsonb,
  evidence_json jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb
);

create index if not exists construction_daily_logs_job_idx
  on public.construction_daily_logs (tenant_id, service_job_id, log_date desc, created_at desc);

create index if not exists construction_daily_logs_review_idx
  on public.construction_daily_logs (tenant_id, status, created_at desc);

create index if not exists construction_job_health_snapshots_job_idx
  on public.construction_job_health_snapshots (tenant_id, service_job_id, calculated_at desc);

alter table public.construction_daily_logs enable row level security;
alter table public.construction_job_health_snapshots enable row level security;

drop policy if exists construction_daily_logs_tenant_member on public.construction_daily_logs;
create policy construction_daily_logs_tenant_member
on public.construction_daily_logs
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists construction_job_health_snapshots_tenant_member on public.construction_job_health_snapshots;
create policy construction_job_health_snapshots_tenant_member
on public.construction_job_health_snapshots
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.plan_feature_matrix (
  plan_key, feature_key, feature_label, included, limit_label, sort_order, metadata_json
)
values
  ('job_tracker', 'construction_job_health', 'Construction Job Health', true, 'Live job cost, schedule, procurement, field-log, and evidence review', 59, '{"construction":true,"simpleMode":true,"approvalRequired":true}'::jsonb),
  ('starter', 'construction_job_health', 'Construction Job Health', true, 'Evidence-backed project health and reviewed field intelligence', 125, '{"construction":true,"simpleMode":true,"approvalRequired":true}'::jsonb),
  ('growth', 'construction_job_health', 'Construction Job Health Plus', true, 'Project health plus connected customer and growth workflows', 225, '{"construction":true,"approvalRequired":true}'::jsonb),
  ('operator', 'construction_job_health', 'Construction Risk Command', true, 'Cross-project monitoring, escalation, and owner command integration', 325, '{"construction":true,"approvalRequired":true}'::jsonb)
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
  'construction_job_health',
  'enabled',
  null,
  'monthly',
  '{"category":"Construction","description":"Evidence-backed job health and reviewed natural-language field logs","approvalMode":"review_required","overagePolicy":"allow","costed":false,"publicFacing":false}'::jsonb,
  now()
from public.tenants
on conflict (tenant_id, feature_key) do update
set status = 'enabled',
    usage_limit = null,
    metadata_json = public.workspace_feature_entitlements.metadata_json || excluded.metadata_json,
    updated_at = now();
