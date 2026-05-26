create table if not exists public.service_operational_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  task_type text not null
    check (task_type in (
      'schedule_job',
      'assign_technician',
      'estimate_followup',
      'invoice_followup',
      'collect_payment',
      'create_invoice',
      'request_review',
      'recurring_service_due',
      'inventory_reorder',
      'job_completion_review'
    )),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  status text not null default 'open'
    check (status in ('open', 'scheduled', 'done', 'dismissed')),
  title text not null,
  detail text not null,
  next_step text not null,
  due_at timestamptz,
  primary_entity_type text
    check (primary_entity_type in ('customer', 'estimate', 'job', 'invoice', 'review_request', 'recurring_plan', 'inventory_item')),
  primary_entity_id uuid,
  source_table text,
  source_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_service_operational_tasks_unique_open
  on public.service_operational_tasks(tenant_id, task_type, coalesce(source_table, ''), coalesce(source_id::text, ''), coalesce(primary_entity_type, ''), coalesce(primary_entity_id::text, ''))
  where status in ('open', 'scheduled');

create index if not exists idx_service_operational_tasks_tenant_status
  on public.service_operational_tasks(tenant_id, status, priority, due_at);

create index if not exists idx_service_operational_tasks_customer
  on public.service_operational_tasks(tenant_id, customer_id, status);

alter table public.service_operational_tasks enable row level security;

drop policy if exists service_operational_tasks_tenant_operator on public.service_operational_tasks;
create policy service_operational_tasks_tenant_operator
on public.service_operational_tasks
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
