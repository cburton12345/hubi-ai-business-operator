alter table public.operations_customer_update_drafts
  add column if not exists recipient_contact text;

create table if not exists public.operations_receipt_extractions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  field_media_id uuid references public.operations_field_media(id) on delete cascade,
  expense_id uuid references public.operations_expenses(id) on delete set null,
  vendor text,
  extracted_total_cents integer not null default 0,
  confidence numeric not null default 0,
  extracted_text text,
  extracted_fields_json jsonb not null default '{}'::jsonb,
  status text not null default 'needs_review'
    check (status in ('needs_review', 'approved', 'rejected', 'posted_to_expense')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_operations_receipt_extractions_tenant_status
  on public.operations_receipt_extractions(tenant_id, status, created_at desc);

alter table public.operations_receipt_extractions enable row level security;

drop policy if exists operations_receipt_extractions_tenant on public.operations_receipt_extractions;
create policy operations_receipt_extractions_tenant on public.operations_receipt_extractions for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));
