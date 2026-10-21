-- One tenant-scoped product identity connects pricebook, stock, and supplier
-- records. Source-specific names and prices remain intact; the canonical ID is
-- the stable join key used by POS, estimates, purchasing, and reporting.

create table if not exists public.commerce_catalog_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  normalized_sku text not null,
  display_sku text not null,
  display_name text not null,
  status text not null default 'active' check (status in ('active','merged','retired')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,normalized_sku),
  unique (id,tenant_id)
);

alter table public.pricebook_items
  add column if not exists commerce_catalog_item_id uuid;
alter table public.service_inventory_items
  add column if not exists commerce_catalog_item_id uuid;
alter table public.supplier_products
  add column if not exists commerce_catalog_item_id uuid;

do $$ begin
  alter table public.pricebook_items add constraint pricebook_items_catalog_tenant_fk
    foreign key (commerce_catalog_item_id,tenant_id) references public.commerce_catalog_items(id,tenant_id) on delete restrict;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.service_inventory_items add constraint service_inventory_items_catalog_tenant_fk
    foreign key (commerce_catalog_item_id,tenant_id) references public.commerce_catalog_items(id,tenant_id) on delete restrict;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.supplier_products add constraint supplier_products_catalog_tenant_fk
    foreign key (commerce_catalog_item_id,tenant_id) references public.commerce_catalog_items(id,tenant_id) on delete restrict;
exception when duplicate_object then null; end $$;

create or replace function public.normalized_commerce_sku(value text)
returns text language sql immutable strict as $$
  select lower(regexp_replace(trim(value), '\s+', '', 'g'))
$$;

insert into public.commerce_catalog_items (tenant_id,normalized_sku,display_sku,display_name,metadata_json)
select tenant_id,normalized_sku,min(display_sku),min(display_name),jsonb_build_object('source','migration_265_backfill')
from (
  select tenant_id,public.normalized_commerce_sku(sku) normalized_sku,sku display_sku,name display_name
    from public.pricebook_items where tenant_id is not null and nullif(trim(sku),'') is not null
  union all
  select tenant_id,public.normalized_commerce_sku(sku),sku,name
    from public.service_inventory_items where tenant_id is not null and nullif(trim(sku),'') is not null
  union all
  select tenant_id,public.normalized_commerce_sku(sku),sku,product_name
    from public.supplier_products where tenant_id is not null and nullif(trim(sku),'') is not null
) source
group by tenant_id,normalized_sku
on conflict (tenant_id,normalized_sku) do nothing;

update public.pricebook_items source set commerce_catalog_item_id=catalog.id
from public.commerce_catalog_items catalog
where source.tenant_id=catalog.tenant_id and source.sku is not null
  and public.normalized_commerce_sku(source.sku)=catalog.normalized_sku;
update public.service_inventory_items source set commerce_catalog_item_id=catalog.id
from public.commerce_catalog_items catalog
where source.tenant_id=catalog.tenant_id and source.sku is not null
  and public.normalized_commerce_sku(source.sku)=catalog.normalized_sku;
update public.supplier_products source set commerce_catalog_item_id=catalog.id
from public.commerce_catalog_items catalog
where source.tenant_id=catalog.tenant_id and source.sku is not null
  and public.normalized_commerce_sku(source.sku)=catalog.normalized_sku;

create or replace function public.link_commerce_catalog_identity()
returns trigger language plpgsql as $$
declare
  source_name text;
  catalog_id uuid;
begin
  if new.tenant_id is null or nullif(trim(new.sku),'') is null then
    new.commerce_catalog_item_id := null;
    return new;
  end if;
  source_name := case when tg_table_name='supplier_products' then new.product_name else new.name end;
  insert into public.commerce_catalog_items (tenant_id,normalized_sku,display_sku,display_name,metadata_json)
  values (new.tenant_id,public.normalized_commerce_sku(new.sku),trim(new.sku),source_name,
    jsonb_build_object('firstSourceTable',tg_table_name))
  on conflict (tenant_id,normalized_sku) do update set updated_at=now()
  returning id into catalog_id;
  new.commerce_catalog_item_id := catalog_id;
  return new;
end $$;

drop trigger if exists pricebook_items_link_catalog on public.pricebook_items;
create trigger pricebook_items_link_catalog before insert or update of tenant_id,sku,name
  on public.pricebook_items for each row execute function public.link_commerce_catalog_identity();
drop trigger if exists service_inventory_items_link_catalog on public.service_inventory_items;
create trigger service_inventory_items_link_catalog before insert or update of tenant_id,sku,name
  on public.service_inventory_items for each row execute function public.link_commerce_catalog_identity();
drop trigger if exists supplier_products_link_catalog on public.supplier_products;
create trigger supplier_products_link_catalog before insert or update of tenant_id,sku,product_name
  on public.supplier_products for each row execute function public.link_commerce_catalog_identity();

create index if not exists pricebook_items_catalog_idx on public.pricebook_items(tenant_id,commerce_catalog_item_id);
create index if not exists service_inventory_items_catalog_idx on public.service_inventory_items(tenant_id,commerce_catalog_item_id);
create index if not exists supplier_products_catalog_idx on public.supplier_products(tenant_id,commerce_catalog_item_id);

alter table public.commerce_catalog_items enable row level security;
drop policy if exists commerce_catalog_items_tenant_operator on public.commerce_catalog_items;
create policy commerce_catalog_items_tenant_operator on public.commerce_catalog_items for all
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

revoke all on table public.commerce_catalog_items
from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.commerce_catalog_items
to authenticated, service_role;

comment on table public.commerce_catalog_items is
  'Tenant-scoped canonical identity for an SKU shared by pricebook, inventory, supplier, POS, estimate, purchasing, and reporting paths.';
