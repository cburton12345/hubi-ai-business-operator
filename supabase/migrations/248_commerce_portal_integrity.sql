-- Close deterministic accounting, receiving, and public-portal integrity gaps.

alter table public.pos_sale_items
  add column if not exists unit_cost_cents integer not null default 0
    check (unit_cost_cents >= 0);

alter table public.vendor_bills
  add column if not exists expected_subtotal_cents integer,
  add column if not exists variance_cents integer,
  add column if not exists reconciliation_status text not null default 'unverified'
    check (reconciliation_status in ('matched','mismatch','unverified'));

alter table public.customer_portal_requests
  add column if not exists idempotency_key uuid;
alter table public.customer_portal_messages
  add column if not exists idempotency_key uuid;

create unique index if not exists customer_portal_requests_idempotency_unique
  on public.customer_portal_requests(tenant_id,customer_id,idempotency_key)
  where idempotency_key is not null;
create unique index if not exists customer_portal_messages_idempotency_unique
  on public.customer_portal_messages(tenant_id,customer_id,idempotency_key)
  where idempotency_key is not null;

comment on column public.pos_sale_items.unit_cost_cents is
  'Inventory cost captured at sale time so returns and job/COGS evidence retain the original cost basis.';
comment on column public.vendor_bills.reconciliation_status is
  'Deterministic comparison with the received or ordered purchase-order subtotal. Mismatches cannot be approved or exported.';
comment on column public.customer_portal_requests.idempotency_key is
  'Browser-generated submission key preventing duplicate portal requests.';
comment on column public.customer_portal_messages.idempotency_key is
  'Browser-generated submission key preventing duplicate portal messages.';
