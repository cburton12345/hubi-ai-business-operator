-- Phase 5: deterministic inventory, procurement receiving, payment exception,
-- and accounting synchronization records. Provider execution remains gated.

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  location_type text not null default 'warehouse'
    check (location_type in ('warehouse', 'vehicle', 'office', 'job_site', 'virtual')),
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.inventory_bins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (location_id, name)
);

alter table public.service_inventory_items
  add column if not exists sku text,
  add column if not exists inventory_location_id uuid references public.inventory_locations(id) on delete set null,
  add column if not exists bin_id uuid references public.inventory_bins(id) on delete set null,
  add column if not exists unit_cost_cents integer not null default 0,
  add column if not exists serialized boolean not null default false;

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  inventory_item_id uuid not null references public.service_inventory_items(id) on delete cascade,
  from_location_id uuid references public.inventory_locations(id) on delete set null,
  to_location_id uuid references public.inventory_locations(id) on delete set null,
  work_order_id uuid references public.service_work_orders(id) on delete set null,
  visit_id uuid references public.service_visits(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  transaction_type text not null
    check (transaction_type in ('receive', 'consume', 'adjust', 'reserve', 'release', 'transfer', 'return', 'write_off')),
  quantity_delta numeric(12,4) not null,
  unit_cost_cents integer not null default 0 check (unit_cost_cents >= 0),
  reason text,
  source text not null default 'manual',
  idempotency_key text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists inventory_transactions_idempotency_unique
  on public.inventory_transactions (tenant_id, idempotency_key)
  where idempotency_key is not null;

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  inventory_item_id uuid not null references public.service_inventory_items(id) on delete cascade,
  work_order_id uuid references public.service_work_orders(id) on delete cascade,
  visit_id uuid references public.service_visits(id) on delete cascade,
  quantity numeric(12,4) not null check (quantity > 0),
  status text not null default 'reserved'
    check (status in ('reserved', 'partially_consumed', 'consumed', 'released', 'canceled')),
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  received_at timestamptz not null default now(),
  received_by_user_id uuid references public.users(id) on delete set null,
  destination_location_id uuid references public.inventory_locations(id) on delete set null,
  packing_slip_number text,
  idempotency_key text,
  status text not null default 'received'
    check (status in ('received', 'partial', 'rejected', 'reversed')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_order_receipt_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  receipt_id uuid not null references public.purchase_order_receipts(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id) on delete cascade,
  inventory_item_id uuid references public.service_inventory_items(id) on delete set null,
  quantity_received numeric(12,4) not null check (quantity_received >= 0),
  quantity_rejected numeric(12,4) not null default 0 check (quantity_rejected >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_bills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  bill_number text,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'approved', 'exported', 'paid', 'void')),
  bill_date date,
  due_date date,
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  external_accounting_id text,
  document_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_id uuid not null references public.service_invoice_payments(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'requested'
    check (status in ('requested', 'pending', 'succeeded', 'failed', 'canceled')),
  reason text,
  provider_refund_id text,
  requested_by_user_id uuid references public.users(id) on delete set null,
  processed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_disputes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_id uuid references public.service_invoice_payments(id) on delete set null,
  provider_dispute_id text,
  amount_cents integer not null default 0,
  status text not null default 'needs_response'
    check (status in ('warning', 'needs_response', 'under_review', 'won', 'lost', 'closed')),
  reason text,
  response_due_at timestamptz,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounting_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null default 'quickbooks_online',
  direction text not null default 'bidirectional'
    check (direction in ('export', 'import', 'bidirectional')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'partial', 'failed', 'canceled')),
  started_at timestamptz,
  completed_at timestamptz,
  records_seen integer not null default 0,
  records_succeeded integer not null default 0,
  records_failed integer not null default 0,
  cursor_json jsonb not null default '{}'::jsonb,
  error_summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_sync_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sync_run_id uuid references public.accounting_sync_runs(id) on delete set null,
  provider text not null default 'quickbooks_online',
  entity_type text not null,
  local_record_id uuid,
  provider_record_id text,
  local_version text,
  provider_version text,
  status text not null default 'pending'
    check (status in ('pending', 'synced', 'conflict', 'failed', 'skipped')),
  conflict_json jsonb not null default '{}'::jsonb,
  payload_hash text,
  last_synced_at timestamptz,
  error_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists accounting_sync_record_identity_unique
  on public.accounting_sync_records (tenant_id, provider, entity_type, local_record_id)
  where local_record_id is not null;

alter table public.service_invoices
  add column if not exists tax_rate_bps integer not null default 0,
  add column if not exists credit_cents integer not null default 0,
  add column if not exists write_off_cents integer not null default 0,
  add column if not exists statement_date date,
  add column if not exists accounting_status text not null default 'not_synced'
    check (accounting_status in ('not_synced', 'queued', 'synced', 'conflict', 'failed'));

create index if not exists inventory_transactions_item_idx
  on public.inventory_transactions (tenant_id, inventory_item_id, created_at desc);
create index if not exists inventory_reservations_open_idx
  on public.inventory_reservations (tenant_id, status, work_order_id);
create index if not exists purchase_order_receipts_po_idx
  on public.purchase_order_receipts (tenant_id, purchase_order_id, received_at desc);
create unique index if not exists purchase_order_receipts_idempotency_unique
  on public.purchase_order_receipts (tenant_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists vendor_bills_status_idx
  on public.vendor_bills (tenant_id, status, due_date);
create unique index if not exists vendor_bills_number_unique
  on public.vendor_bills (tenant_id, supplier_id, bill_number)
  where supplier_id is not null and bill_number is not null;
create index if not exists payment_disputes_attention_idx
  on public.payment_disputes (tenant_id, status, response_due_at);
create index if not exists accounting_sync_runs_status_idx
  on public.accounting_sync_runs (tenant_id, status, created_at desc);

alter table public.inventory_locations enable row level security;
alter table public.inventory_bins enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.purchase_order_receipts enable row level security;
alter table public.purchase_order_receipt_items enable row level security;
alter table public.vendor_bills enable row level security;
alter table public.payment_refunds enable row level security;
alter table public.payment_disputes enable row level security;
alter table public.accounting_sync_runs enable row level security;
alter table public.accounting_sync_records enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'inventory_locations', 'inventory_bins', 'inventory_transactions',
    'inventory_reservations', 'purchase_order_receipts',
    'purchase_order_receipt_items', 'vendor_bills', 'payment_refunds',
    'payment_disputes', 'accounting_sync_runs', 'accounting_sync_records'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_tenant_operator',
      table_name
    );
  end loop;
end $$;

-- Convert existing free-text inventory locations into normalized locations.
insert into public.inventory_locations (tenant_id, name)
select distinct tenant_id, trim(location)
from public.service_inventory_items
where location is not null and trim(location) <> ''
on conflict (tenant_id, name) do nothing;

update public.service_inventory_items i
set inventory_location_id = l.id
from public.inventory_locations l
where l.tenant_id = i.tenant_id and lower(l.name) = lower(trim(i.location))
  and i.inventory_location_id is null;
