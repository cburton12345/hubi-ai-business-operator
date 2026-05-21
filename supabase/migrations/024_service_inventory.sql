create table if not exists public.service_inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  name text not null,
  category text not null default 'part'
    check (category in ('part', 'material', 'equipment', 'tool', 'vehicle', 'other')),
  status text not null default 'available'
    check (status in ('available', 'reserved', 'in_use', 'maintenance', 'retired')),
  quantity numeric(10,2) not null default 0,
  reorder_threshold numeric(10,2) not null default 0,
  unit text,
  location text,
  assigned_job_id uuid references public.service_jobs(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_inventory_items_tenant_status
  on public.service_inventory_items(tenant_id, status, category);

create index if not exists idx_service_inventory_items_job
  on public.service_inventory_items(tenant_id, assigned_job_id);

alter table public.service_inventory_items enable row level security;

drop policy if exists service_inventory_items_tenant_operator on public.service_inventory_items;
create policy service_inventory_items_tenant_operator
on public.service_inventory_items
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));
