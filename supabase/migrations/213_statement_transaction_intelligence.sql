-- Statement transactions remain children of one permanently preserved source
-- document. They are product-neutral; allocation targets are string references
-- supplied by the consuming product rather than foreign keys into Ferocity.
create table if not exists public.document_intelligence_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.document_intelligence_documents(id) on delete cascade,
  position integer not null default 0,
  source_key text not null,
  transaction_date date,
  posted_date date,
  description text not null,
  merchant_name text,
  reference_number text,
  amount_cents integer not null check (amount_cents > 0),
  direction text not null check (direction in ('debit','credit')),
  balance_cents integer,
  suggested_category text,
  is_transfer boolean not null default false,
  transfer_reason text,
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  status text not null default 'needs_review' check (status in ('needs_review','duplicate','approved','excluded','failed')),
  duplicate_of_ref text,
  duplicate_confidence numeric(4,3) check (duplicate_confidence between 0 and 1),
  allocation_target_type text,
  allocation_target_ref text,
  allocation_target_label text,
  allocation_confidence numeric(4,3) check (allocation_confidence between 0 and 1),
  allocation_rationale text,
  posted_expense_ref text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, source_key)
);

create index if not exists document_intelligence_transactions_document_idx
  on public.document_intelligence_transactions (document_id, position);
create index if not exists document_intelligence_transactions_workspace_idx
  on public.document_intelligence_transactions (tenant_id, status, transaction_date desc);
create index if not exists document_intelligence_transactions_source_idx
  on public.document_intelligence_transactions (tenant_id, source_key);
create index if not exists document_intelligence_transactions_search_idx
  on public.document_intelligence_transactions using gin (
    to_tsvector('english', coalesce(merchant_name, '') || ' ' || description || ' ' || coalesce(suggested_category, ''))
  );

alter table public.document_intelligence_transactions enable row level security;
drop policy if exists document_intelligence_transactions_tenant_operator on public.document_intelligence_transactions;
create policy document_intelligence_transactions_tenant_operator
  on public.document_intelligence_transactions for all
  using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
  with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

comment on table public.document_intelligence_transactions is
  'Product-neutral transaction rows extracted from a preserved bank, card, or payment statement.';
