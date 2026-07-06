create table if not exists public.operations_worker_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker_id uuid references public.operations_workers(id) on delete set null,
  assignment_id uuid references public.operations_assignments(id) on delete set null,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  payee_name text not null,
  payment_type text not null default 'payroll'
    check (payment_type in ('payroll', 'subcontractor', 'bonus', 'reimbursement', 'draw', 'other')),
  amount_cents integer not null default 0,
  payment_date date not null default current_date,
  method text not null default 'manual'
    check (method in ('manual', 'cash', 'check', 'ach', 'card', 'payroll_provider', 'other')),
  status text not null default 'recorded'
    check (status in ('planned', 'recorded', 'reviewed', 'void')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_material_list_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_job_id uuid references public.service_jobs(id) on delete set null,
  assignment_id uuid references public.operations_assignments(id) on delete set null,
  material_name text not null,
  quantity numeric(10,2),
  unit text,
  estimated_cost_cents integer not null default 0,
  actual_cost_cents integer not null default 0,
  status text not null default 'needed'
    check (status in ('needed', 'ordered', 'purchased', 'used', 'returned', 'cancelled')),
  source text not null default 'manual'
    check (source in ('manual', 'ai_walkthrough', 'estimate', 'job', 'field')),
  notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_operations_worker_payments_tenant_date
  on public.operations_worker_payments(tenant_id, payment_date desc, status);

create index if not exists idx_operations_worker_payments_job
  on public.operations_worker_payments(tenant_id, service_job_id, payment_date desc);

create index if not exists idx_operations_worker_payments_worker
  on public.operations_worker_payments(tenant_id, worker_id, payment_date desc);

create index if not exists idx_job_material_list_items_tenant_status
  on public.job_material_list_items(tenant_id, status, created_at desc);

create index if not exists idx_job_material_list_items_job
  on public.job_material_list_items(tenant_id, service_job_id, status);

alter table public.operations_worker_payments enable row level security;
alter table public.job_material_list_items enable row level security;

drop policy if exists operations_worker_payments_tenant on public.operations_worker_payments;
create policy operations_worker_payments_tenant
on public.operations_worker_payments
for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists job_material_list_items_tenant on public.job_material_list_items;
create policy job_material_list_items_tenant
on public.job_material_list_items
for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

do $$
begin
  if to_regclass('public.feature_entitlements') is not null then
    insert into public.feature_entitlements (feature_key, feature_name, description, tier, status, metadata_json)
    values
      (
        'job_money_tracker',
        'Jobs and money tracker',
        'Track bids, job costs, worker/subcontractor payments, material lists, and job margin in one operator view.',
        'operations',
        'enabled',
        '{"ownerVisible": true, "requiresApproval": false}'::jsonb
      )
    on conflict (feature_key) do update set
      feature_name = excluded.feature_name,
      description = excluded.description,
      tier = excluded.tier,
      status = excluded.status,
      metadata_json = public.feature_entitlements.metadata_json || excluded.metadata_json;
  end if;
end $$;
