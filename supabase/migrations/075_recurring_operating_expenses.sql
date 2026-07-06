create table if not exists public.recurring_operating_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vendor text not null,
  description text,
  category text not null default 'overhead',
  assign_to text not null default 'overhead'
    check (assign_to in ('job', 'customer', 'department', 'overhead')),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  cadence text not null default 'monthly'
    check (cadence in ('weekly', 'biweekly', 'monthly', 'quarterly', 'annually')),
  next_due_date date,
  autopost_mode text not null default 'review_first'
    check (autopost_mode in ('review_first', 'auto_create_draft', 'paused')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  last_created_expense_id uuid references public.operations_expenses(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recurring_operating_expenses_tenant_due
  on public.recurring_operating_expenses(tenant_id, status, next_due_date);

alter table public.recurring_operating_expenses enable row level security;

drop policy if exists recurring_operating_expenses_tenant_operator on public.recurring_operating_expenses;
create policy recurring_operating_expenses_tenant_operator
on public.recurring_operating_expenses
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.workspace_feature_entitlements (tenant_id, feature_key, status, usage_limit, usage_period, metadata_json)
select
  t.id,
  'recurring_expense_tracking',
  'enabled',
  null,
  'monthly',
  '{"category":"Finance","description":"Recurring operating expense rules with review-first posting into job or overhead expenses.","approvalMode":"review_required","plainRule":"Track repeating bills and overhead. Create expense records only after review unless the workspace later enables draft autoposting.","costed":false,"publicFacing":false}'::jsonb
from public.tenants t
on conflict (tenant_id, feature_key) do update
set status = excluded.status,
    metadata_json = excluded.metadata_json || public.workspace_feature_entitlements.metadata_json,
    updated_at = now();
