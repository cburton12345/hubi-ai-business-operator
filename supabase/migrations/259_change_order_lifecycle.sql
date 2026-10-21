alter table public.estimate_change_orders
  add column if not exists estimated_cost_cents integer not null default 0,
  add column if not exists schedule_impact_minutes integer not null default 0,
  add column if not exists idempotency_key text,
  add column if not exists sent_at timestamptz,
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by_name text,
  add column if not exists decided_by_email text,
  add column if not exists decision_note text,
  add column if not exists decision_ip inet,
  add column if not exists decision_user_agent text,
  add column if not exists decision_document_sha256 text,
  add column if not exists applied_at timestamptz,
  add column if not exists invoice_line_item_id uuid references public.invoice_line_items(id) on delete set null;

alter table public.estimate_change_orders
  drop constraint if exists estimate_change_orders_estimated_cost_nonnegative,
  add constraint estimate_change_orders_estimated_cost_nonnegative
    check (estimated_cost_cents >= 0),
  drop constraint if exists estimate_change_orders_schedule_impact_nonnegative,
  add constraint estimate_change_orders_schedule_impact_nonnegative
    check (schedule_impact_minutes >= 0),
  drop constraint if exists estimate_change_orders_decision_hash_valid,
  add constraint estimate_change_orders_decision_hash_valid
    check (decision_document_sha256 is null or decision_document_sha256 ~ '^[0-9a-f]{64}$');

create unique index if not exists uniq_estimate_change_orders_idempotency
  on public.estimate_change_orders (tenant_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists uniq_estimate_change_orders_invoice_line
  on public.estimate_change_orders (tenant_id, invoice_line_item_id)
  where invoice_line_item_id is not null;

create index if not exists idx_estimate_change_orders_customer_decision
  on public.estimate_change_orders (tenant_id, estimate_id, status, sent_at desc);

comment on column public.estimate_change_orders.estimated_cost_cents is
  'Approved forecast cost impact. This is not an incurred expense and must not enter actual-cost reporting.';
comment on column public.estimate_change_orders.applied_at is
  'Timestamp at which schedule and eligible draft-invoice effects were applied exactly once.';
