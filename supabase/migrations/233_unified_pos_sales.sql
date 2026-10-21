-- Thin POS coordinator over the canonical invoice, payment, ledger, and inventory tables.
create table if not exists public.pos_sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_id uuid not null references public.service_invoices(id) on delete restrict,
  job_id uuid references public.service_jobs(id) on delete set null,
  status text not null default 'open' check (status in ('open','completed','partially_refunded','refunded','void')),
  tender_type text not null default 'unpaid' check (tender_type in ('unpaid','cash','card_external','cash_app','check','external')),
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  currency text not null default 'usd',
  idempotency_key text not null,
  external_reference text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  unique (tenant_id, invoice_id)
);

create table if not exists public.pos_sale_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pos_sale_id uuid not null references public.pos_sales(id) on delete cascade,
  invoice_line_item_id uuid not null references public.invoice_line_items(id) on delete restrict,
  inventory_item_id uuid references public.service_inventory_items(id) on delete set null,
  name text not null,
  quantity numeric(12,4) not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pos_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pos_sale_id uuid not null references public.pos_sales(id) on delete restrict,
  payment_refund_id uuid references public.payment_refunds(id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null,
  idempotency_key text not null,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table if not exists public.pos_return_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pos_return_id uuid not null references public.pos_returns(id) on delete cascade,
  pos_sale_item_id uuid not null references public.pos_sale_items(id) on delete restrict,
  quantity numeric(12,4) not null check (quantity > 0),
  amount_cents integer not null check (amount_cents >= 0),
  restocked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists pos_sales_created_idx on public.pos_sales(tenant_id, created_at desc);
create index if not exists pos_sale_items_sale_idx on public.pos_sale_items(tenant_id, pos_sale_id);

alter table public.pos_sales enable row level security;
alter table public.pos_sale_items enable row level security;
alter table public.pos_returns enable row level security;
alter table public.pos_return_items enable row level security;
drop policy if exists pos_sales_tenant_operator on public.pos_sales;
create policy pos_sales_tenant_operator on public.pos_sales for all
  using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
  with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));
drop policy if exists pos_sale_items_tenant_operator on public.pos_sale_items;
create policy pos_sale_items_tenant_operator on public.pos_sale_items for all
  using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
  with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));
drop policy if exists pos_returns_tenant_operator on public.pos_returns;
create policy pos_returns_tenant_operator on public.pos_returns for all
  using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
  with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));
drop policy if exists pos_return_items_tenant_operator on public.pos_return_items;
create policy pos_return_items_tenant_operator on public.pos_return_items for all
  using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
  with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

comment on table public.pos_sales is 'Idempotent POS coordination records backed by canonical invoices, payments, ledger entries, and inventory movements.';
