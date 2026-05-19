create table if not exists public.workspace_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  display_name text,
  timezone text not null default 'America/Los_Angeles',
  default_report_email text,
  plan_key text not null default 'starter',
  billing_status text not null default 'not_connected',
  onboarding_checklist_json jsonb not null default '[]'::jsonb,
  usage_json jsonb not null default '{}'::jsonb,
  export_policy text not null default 'manual_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_access_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'operator'
    check (role in ('admin', 'operator', 'viewer')),
  status text not null default 'active'
    check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, user_id)
);

create table if not exists public.form_key_rotations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete cascade,
  previous_public_key text not null,
  new_public_key text not null,
  rotated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_scores (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  score integer not null default 0 check (score >= 0 and score <= 100),
  grade text not null default 'cold' check (grade in ('hot', 'warm', 'cold', 'spam_review')),
  reasons_json jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_user_id uuid references public.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_exports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  export_type text not null default 'csv',
  row_count integer not null default 0,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.business_workflow_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  business_model text not null,
  workflow_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, business_model)
);

alter table public.workspace_settings enable row level security;
alter table public.brand_access_rules enable row level security;
alter table public.form_key_rotations enable row level security;
alter table public.lead_scores enable row level security;
alter table public.lead_assignments enable row level security;
alter table public.lead_exports enable row level security;
alter table public.business_workflow_configs enable row level security;

create index if not exists idx_brand_access_rules_tenant_user on public.brand_access_rules(tenant_id, user_id, status);
create index if not exists idx_lead_scores_tenant_grade on public.lead_scores(tenant_id, grade, updated_at desc);
create index if not exists idx_lead_assignments_tenant_lead on public.lead_assignments(tenant_id, lead_id, status);
create index if not exists idx_business_workflow_configs_tenant on public.business_workflow_configs(tenant_id, active);

drop policy if exists workspace_settings_tenant_admin on public.workspace_settings;
create policy workspace_settings_tenant_admin
on public.workspace_settings
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists brand_access_rules_tenant_admin on public.brand_access_rules;
create policy brand_access_rules_tenant_admin
on public.brand_access_rules
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists form_key_rotations_tenant_admin on public.form_key_rotations;
create policy form_key_rotations_tenant_admin
on public.form_key_rotations
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

drop policy if exists lead_scores_tenant_operator on public.lead_scores;
create policy lead_scores_tenant_operator
on public.lead_scores
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists lead_assignments_tenant_operator on public.lead_assignments;
create policy lead_assignments_tenant_operator
on public.lead_assignments
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists lead_exports_tenant_operator on public.lead_exports;
create policy lead_exports_tenant_operator
on public.lead_exports
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists business_workflow_configs_tenant_operator on public.business_workflow_configs;
create policy business_workflow_configs_tenant_operator
on public.business_workflow_configs
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));
