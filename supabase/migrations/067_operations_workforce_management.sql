create table if not exists public.operations_workers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  name text not null,
  role_type text not null default 'employee'
    check (role_type in ('owner', 'office_manager', 'crew_leader', 'employee', 'subcontractor', 'manager', 'other')),
  trade text,
  phone text,
  email text,
  hourly_rate_cents integer not null default 0,
  availability_status text not null default 'available'
    check (availability_status in ('available', 'scheduled', 'off', 'blocked', 'inactive')),
  payroll_type text not null default 'hourly'
    check (payroll_type in ('hourly', 'salary', 'piece_rate', 'per_job', 'subcontractor')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_crews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  crew_leader_worker_id uuid references public.operations_workers(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'archived')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_crew_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  crew_id uuid not null references public.operations_crews(id) on delete cascade,
  worker_id uuid not null references public.operations_workers(id) on delete cascade,
  member_role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (crew_id, worker_id)
);

create table if not exists public.operations_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  worker_id uuid references public.operations_workers(id) on delete set null,
  crew_id uuid references public.operations_crews(id) on delete set null,
  title text not null,
  jobsite text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'blocked', 'missed', 'archived')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  task_list_json jsonb not null default '[]'::jsonb,
  ai_dispatch_notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assignment_id uuid references public.operations_assignments(id) on delete set null,
  worker_id uuid references public.operations_workers(id) on delete set null,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  break_minutes integer not null default 0,
  clock_in_location text,
  clock_out_location text,
  gps_verified boolean not null default false,
  qr_verified boolean not null default false,
  status text not null default 'open'
    check (status in ('open', 'closed', 'needs_review', 'approved', 'exported')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assignment_id uuid references public.operations_assignments(id) on delete set null,
  worker_id uuid references public.operations_workers(id) on delete set null,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  vendor text,
  expense_date date,
  amount_cents integer not null default 0,
  tax_cents integer not null default 0,
  category text not null default 'materials',
  assign_to text not null default 'job'
    check (assign_to in ('job', 'customer', 'department', 'overhead')),
  receipt_url text,
  ai_summary text,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'approved', 'rejected', 'exported')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_mileage_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assignment_id uuid references public.operations_assignments(id) on delete set null,
  worker_id uuid references public.operations_workers(id) on delete set null,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  vehicle_label text,
  start_location text,
  end_location text,
  miles numeric not null default 0,
  entry_method text not null default 'manual'
    check (entry_method in ('manual', 'gps', 'vehicle_integration')),
  entry_date date not null default current_date,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'approved', 'rejected', 'exported')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operations_material_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assignment_id uuid references public.operations_assignments(id) on delete set null,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  worker_id uuid references public.operations_workers(id) on delete set null,
  material_name text not null,
  quantity numeric,
  unit text,
  log_type text not null default 'used'
    check (log_type in ('purchased', 'used', 'returned', 'waste', 'requested')),
  cost_cents integer not null default 0,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'approved', 'rejected')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_operations_workers_tenant_status
  on public.operations_workers(tenant_id, availability_status, role_type);
create index if not exists idx_operations_assignments_tenant_schedule
  on public.operations_assignments(tenant_id, scheduled_start, status);
create index if not exists idx_operations_time_entries_tenant_worker
  on public.operations_time_entries(tenant_id, worker_id, clock_in_at desc);
create index if not exists idx_operations_expenses_tenant_status
  on public.operations_expenses(tenant_id, status, created_at desc);
create index if not exists idx_operations_mileage_tenant_status
  on public.operations_mileage_entries(tenant_id, status, entry_date desc);
create index if not exists idx_operations_material_logs_tenant_status
  on public.operations_material_logs(tenant_id, status, created_at desc);

alter table public.operations_workers enable row level security;
alter table public.operations_crews enable row level security;
alter table public.operations_crew_members enable row level security;
alter table public.operations_assignments enable row level security;
alter table public.operations_time_entries enable row level security;
alter table public.operations_expenses enable row level security;
alter table public.operations_mileage_entries enable row level security;
alter table public.operations_material_logs enable row level security;

drop policy if exists operations_workers_tenant on public.operations_workers;
create policy operations_workers_tenant on public.operations_workers for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists operations_crews_tenant on public.operations_crews;
create policy operations_crews_tenant on public.operations_crews for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists operations_crew_members_tenant on public.operations_crew_members;
create policy operations_crew_members_tenant on public.operations_crew_members for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists operations_assignments_tenant on public.operations_assignments;
create policy operations_assignments_tenant on public.operations_assignments for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists operations_time_entries_tenant on public.operations_time_entries;
create policy operations_time_entries_tenant on public.operations_time_entries for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists operations_expenses_tenant on public.operations_expenses;
create policy operations_expenses_tenant on public.operations_expenses for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists operations_mileage_entries_tenant on public.operations_mileage_entries;
create policy operations_mileage_entries_tenant on public.operations_mileage_entries for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists operations_material_logs_tenant on public.operations_material_logs;
create policy operations_material_logs_tenant on public.operations_material_logs for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));
