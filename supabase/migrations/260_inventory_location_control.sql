alter table public.service_inventory_items
  alter column quantity type numeric(12,4) using quantity::numeric(12,4);

create table if not exists public.inventory_location_balances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  inventory_item_id uuid not null references public.service_inventory_items(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  quantity numeric(12,4) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (tenant_id, inventory_item_id, location_id)
);

alter table public.inventory_reservations
  add column if not exists location_id uuid references public.inventory_locations(id) on delete restrict,
  add column if not exists consumed_quantity numeric(12,4) not null default 0,
  add column if not exists released_quantity numeric(12,4) not null default 0,
  add column if not exists idempotency_key text;

alter table public.inventory_reservations
  drop constraint if exists inventory_reservations_consumed_nonnegative,
  add constraint inventory_reservations_consumed_nonnegative check (consumed_quantity >= 0),
  drop constraint if exists inventory_reservations_released_nonnegative,
  add constraint inventory_reservations_released_nonnegative check (released_quantity >= 0),
  drop constraint if exists inventory_reservations_quantity_bounded,
  add constraint inventory_reservations_quantity_bounded check (consumed_quantity + released_quantity <= quantity);

create unique index if not exists inventory_reservations_idempotency_unique
  on public.inventory_reservations (tenant_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.inventory_stock_counts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  inventory_item_id uuid not null references public.service_inventory_items(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  expected_quantity numeric(12,4) not null check (expected_quantity >= 0),
  observed_quantity numeric(12,4) not null check (observed_quantity >= 0),
  adjustment_quantity numeric(12,4) not null,
  reason text not null,
  idempotency_key text not null,
  counted_by_user_id uuid references public.users(id) on delete set null,
  counted_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  unique (tenant_id, idempotency_key)
);

insert into public.inventory_locations (tenant_id, name, location_type, active)
select distinct i.tenant_id, 'Unassigned stock', 'virtual', true
from public.service_inventory_items i
where i.quantity > 0 and i.inventory_location_id is null
on conflict (tenant_id, name) do update set active=true, updated_at=now();

update public.service_inventory_items i
set inventory_location_id=l.id,
    location=coalesce(i.location,l.name),
    updated_at=now()
from public.inventory_locations l
where i.tenant_id=l.tenant_id and l.name='Unassigned stock'
  and i.quantity > 0 and i.inventory_location_id is null;

insert into public.inventory_location_balances (tenant_id, inventory_item_id, location_id, quantity)
select i.tenant_id, i.id, i.inventory_location_id, greatest(i.quantity, 0)
from public.service_inventory_items i
where i.inventory_location_id is not null
on conflict (tenant_id, inventory_item_id, location_id) do nothing;

update public.inventory_reservations r
set location_id=i.inventory_location_id
from public.service_inventory_items i
where r.tenant_id=i.tenant_id and r.inventory_item_id=i.id and r.location_id is null;

create index if not exists inventory_location_balances_lookup_idx
  on public.inventory_location_balances (tenant_id, location_id, inventory_item_id);
create index if not exists inventory_reservations_item_location_idx
  on public.inventory_reservations (tenant_id, inventory_item_id, location_id, status);
create index if not exists inventory_stock_counts_item_idx
  on public.inventory_stock_counts (tenant_id, inventory_item_id, counted_at desc);

alter table public.inventory_location_balances enable row level security;
alter table public.inventory_stock_counts enable row level security;

drop policy if exists inventory_location_balances_tenant_operator on public.inventory_location_balances;
create policy inventory_location_balances_tenant_operator on public.inventory_location_balances
for all using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists inventory_stock_counts_tenant_operator on public.inventory_stock_counts;
create policy inventory_stock_counts_tenant_operator on public.inventory_stock_counts
for all using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

revoke all on table public.inventory_location_balances
from public, anon, authenticated, service_role;
revoke all on table public.inventory_stock_counts
from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.inventory_location_balances
to authenticated, service_role;
grant select, insert, update, delete on table public.inventory_stock_counts
to authenticated, service_role;

comment on table public.inventory_location_balances is
  'Authoritative on-hand quantity per inventory item and physical location. Item quantity remains the tenant-wide total.';
