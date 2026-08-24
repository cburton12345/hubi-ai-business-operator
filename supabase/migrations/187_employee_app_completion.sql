alter table public.operations_workers
  add column if not exists preferred_language text not null default 'en'
    check (preferred_language in ('en', 'es'));

alter table public.workspace_invites
  add column if not exists worker_id uuid references public.operations_workers(id) on delete set null,
  add column if not exists invite_purpose text not null default 'workspace'
    check (invite_purpose in ('workspace', 'employee'));

create index if not exists idx_workspace_invites_employee
  on public.workspace_invites(tenant_id, worker_id, status)
  where worker_id is not null;

create table if not exists public.employee_cash_advances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  worker_id uuid not null references public.operations_workers(id) on delete cascade,
  assignment_id uuid references public.operations_assignments(id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  advanced_at date not null default current_date,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'check', 'bank_transfer', 'payroll', 'other')),
  purpose text,
  status text not null default 'recorded'
    check (status in ('recorded', 'acknowledged', 'disputed', 'partially_recovered', 'recovered', 'void')),
  employee_response_note text,
  employee_responded_at timestamptz,
  created_by_user_id uuid references public.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_cash_advances_worker
  on public.employee_cash_advances(tenant_id, worker_id, advanced_at desc, created_at desc);

alter table public.employee_cash_advances enable row level security;

drop policy if exists employee_cash_advances_operator on public.employee_cash_advances;
create policy employee_cash_advances_operator
on public.employee_cash_advances
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists employee_cash_advances_self_read on public.employee_cash_advances;
create policy employee_cash_advances_self_read
on public.employee_cash_advances
for select
using (
  exists (
    select 1
    from public.operations_workers worker
    where worker.id = employee_cash_advances.worker_id
      and worker.tenant_id = employee_cash_advances.tenant_id
      and worker.user_id = public.current_app_user_id()
      and public.has_tenant_role(employee_cash_advances.tenant_id, array['viewer', 'operator', 'admin', 'owner'])
  )
);

comment on table public.employee_cash_advances is
  'Reviewable record of money advanced to a worker. Ferocity does not automatically deduct advances from wages.';

create table if not exists public.employee_access_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'es')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'spam')),
  owner_note text,
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_employee_access_requests_pending_email
  on public.employee_access_requests(tenant_id, lower(email))
  where status = 'pending';

create index if not exists idx_employee_access_requests_queue
  on public.employee_access_requests(tenant_id, status, created_at desc);

alter table public.employee_access_requests enable row level security;

drop policy if exists employee_access_requests_operator on public.employee_access_requests;
create policy employee_access_requests_operator
on public.employee_access_requests
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

comment on table public.employee_access_requests is
  'Owner-gated employee self-service join requests. A request grants no workspace or employee access by itself.';
