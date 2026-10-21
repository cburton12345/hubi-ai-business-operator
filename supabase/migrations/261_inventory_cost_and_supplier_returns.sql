alter table public.job_material_list_items
  alter column quantity type numeric(12,4) using quantity::numeric(12,4);

create table if not exists public.supplier_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  purchase_receipt_id uuid not null references public.purchase_order_receipts(id) on delete restrict,
  source_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  status text not null default 'shipped' check (status in ('prepared','shipped','credited','canceled')),
  credit_status text not null default 'pending' check (credit_status in ('pending','confirmed','not_expected')),
  expected_credit_cents integer not null default 0 check (expected_credit_cents >= 0),
  confirmed_credit_cents integer check (confirmed_credit_cents is null or confirmed_credit_cents >= 0),
  vendor_credit_reference text,
  reason text not null,
  idempotency_key text not null,
  credit_idempotency_key text,
  shipped_at timestamptz,
  credited_at timestamptz,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,idempotency_key)
);

create unique index if not exists supplier_returns_credit_idempotency_unique
  on public.supplier_returns (tenant_id,credit_idempotency_key)
  where credit_idempotency_key is not null;

create table if not exists public.supplier_return_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_return_id uuid not null references public.supplier_returns(id) on delete cascade,
  receipt_item_id uuid not null references public.purchase_order_receipt_items(id) on delete restrict,
  inventory_item_id uuid not null references public.service_inventory_items(id) on delete restrict,
  quantity numeric(12,4) not null check (quantity > 0),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  extended_cost_cents integer not null check (extended_cost_cents >= 0),
  created_at timestamptz not null default now(),
  unique (supplier_return_id,receipt_item_id)
);

alter table public.inventory_transactions
  add column if not exists supplier_return_id uuid references public.supplier_returns(id) on delete set null;

create table if not exists public.inventory_material_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_transaction_id uuid not null references public.inventory_transactions(id) on delete restrict,
  service_job_id uuid references public.service_jobs(id) on delete restrict,
  customer_location_id uuid references public.customer_locations(id) on delete restrict,
  material_list_item_id uuid references public.job_material_list_items(id) on delete restrict,
  quantity numeric(12,4) not null check (quantity > 0),
  cost_cents integer not null check (cost_cents >= 0),
  status text not null default 'active' check (status in ('active','canceled')),
  note text,
  idempotency_key text not null,
  cancellation_idempotency_key text,
  canceled_at timestamptz,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (service_job_id is not null or customer_location_id is not null),
  unique (tenant_id,idempotency_key)
);

create unique index if not exists inventory_material_allocations_cancellation_unique
  on public.inventory_material_allocations (tenant_id,cancellation_idempotency_key)
  where cancellation_idempotency_key is not null;
create index if not exists supplier_returns_receipt_idx
  on public.supplier_returns (tenant_id,purchase_receipt_id,status,created_at desc);
create index if not exists supplier_return_items_receipt_item_idx
  on public.supplier_return_items (tenant_id,receipt_item_id);
create index if not exists inventory_material_allocations_source_idx
  on public.inventory_material_allocations (tenant_id,source_transaction_id,status);
create index if not exists inventory_material_allocations_job_idx
  on public.inventory_material_allocations (tenant_id,service_job_id,status,created_at desc);
create index if not exists inventory_material_allocations_location_idx
  on public.inventory_material_allocations (tenant_id,customer_location_id,status,created_at desc);

alter table public.supplier_returns enable row level security;
alter table public.supplier_return_items enable row level security;
alter table public.inventory_material_allocations enable row level security;

drop policy if exists supplier_returns_tenant_operator on public.supplier_returns;
create policy supplier_returns_tenant_operator on public.supplier_returns for all
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));
drop policy if exists supplier_return_items_tenant_operator on public.supplier_return_items;
create policy supplier_return_items_tenant_operator on public.supplier_return_items for all
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));
drop policy if exists inventory_material_allocations_tenant_operator on public.inventory_material_allocations;
create policy inventory_material_allocations_tenant_operator on public.inventory_material_allocations for all
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

revoke all on table public.supplier_returns
from public, anon, authenticated, service_role;
revoke all on table public.supplier_return_items
from public, anon, authenticated, service_role;
revoke all on table public.inventory_material_allocations
from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.supplier_returns
to authenticated, service_role;
grant select, insert, update, delete on table public.supplier_return_items
to authenticated, service_role;
grant select, insert, update, delete on table public.inventory_material_allocations
to authenticated, service_role;

comment on table public.supplier_returns is
  'Physical supplier-return evidence. Credit fields record confirmed vendor evidence and never imply cash settlement.';
comment on table public.inventory_material_allocations is
  'Auditable unequal splits of one inventory-consumption movement across canonical jobs or customer locations.';
