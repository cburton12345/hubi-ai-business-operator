create table if not exists public.operational_qa_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'passed', 'failed')),
  checks_json jsonb not null default '[]'::jsonb,
  summary text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.operational_qa_runs enable row level security;

drop policy if exists operational_qa_runs_tenant_operator on public.operational_qa_runs;
create policy operational_qa_runs_tenant_operator
on public.operational_qa_runs
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.users (id, email, name, platform_role)
values
  ('77777777-7777-4777-8777-777777777701', 'owner@betaroofing.example', 'Beta Owner', 'user'),
  ('77777777-7777-4777-8777-777777777702', 'operator@betaroofing.example', 'Beta Operator', 'user'),
  ('77777777-7777-4777-8777-777777777703', 'viewer@betaroofing.example', 'Beta Viewer', 'user')
on conflict (email) do update
set name = excluded.name,
    platform_role = excluded.platform_role,
    updated_at = now();

insert into public.tenant_users (tenant_id, user_id, role, status)
values
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777701', 'owner', 'active'),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777702', 'operator', 'active'),
  ('55555555-5555-4555-8555-555555555555', '77777777-7777-4777-8777-777777777703', 'viewer', 'active')
on conflict (tenant_id, user_id) do update
set role = excluded.role,
    status = excluded.status,
    updated_at = now();

insert into public.beta_launch_checks (tenant_id, check_key, label, status, notes)
values
  ('55555555-5555-4555-8555-555555555555', 'demo-users-seeded', 'Owner, operator, and viewer demo users exist', 'passed', 'Seeded without passwords; create credentials from Access before real login QA.'),
  ('55555555-5555-4555-8555-555555555555', 'operational-qa-run', 'Operational QA run completed', 'pending', null),
  ('55555555-5555-4555-8555-555555555555', 'billing-readiness', 'Billing placeholder reviewed', 'pending', null),
  ('55555555-5555-4555-8555-555555555555', 'webhook-readiness', 'Webhook framework reviewed', 'pending', null)
on conflict (tenant_id, check_key) do update
set label = excluded.label,
    notes = coalesce(public.beta_launch_checks.notes, excluded.notes),
    updated_at = now();
