-- Shared document intelligence kernel. The normalized document and allocation model is
-- intentionally product-neutral; Ferocity is the first adapter and H4R can supply its
-- own allocation target types without changing this schema.
create table if not exists public.document_intelligence_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_product text not null default 'ferocity',
  auto_process_enabled boolean not null default false,
  auto_process_confidence numeric(4,3) not null default 0.92
    check (auto_process_confidence between 0 and 1),
  duplicate_warning_threshold numeric(4,3) not null default 0.84
    check (duplicate_warning_threshold between 0 and 1),
  default_currency text not null default 'USD',
  retention_mode text not null default 'permanent'
    check (retention_mode in ('permanent', 'regulated')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source_product)
);

create table if not exists public.document_intelligence_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_product text not null default 'ferocity',
  source_workspace_ref text,
  source_channel text not null default 'upload'
    check (source_channel in ('camera', 'upload', 'drag_drop', 'email', 'api', 'mobile', 'other')),
  source_message_ref text,
  status text not null default 'processing'
    check (status in ('processing', 'needs_review', 'approved', 'auto_approved', 'rejected', 'failed', 'duplicate')),
  document_type text not null default 'other'
    check (document_type in ('receipt', 'invoice', 'bill', 'purchase_order', 'warranty', 'credit_memo', 'statement', 'other')),
  original_bucket text not null,
  original_storage_path text not null,
  original_file_name text not null,
  original_mime_type text not null,
  original_byte_count bigint not null default 0 check (original_byte_count >= 0),
  content_sha256 text not null,
  vendor_name text,
  document_number text,
  document_date date,
  document_time time,
  currency text not null default 'USD',
  subtotal_cents integer,
  tax_cents integer,
  discount_cents integer,
  fee_cents integer,
  tip_cents integer,
  total_cents integer,
  payment_method text,
  suggested_category text,
  extracted_text text,
  normalized_json jsonb not null default '{}'::jsonb,
  field_confidence_json jsonb not null default '{}'::jsonb,
  overall_confidence numeric(4,3) not null default 0 check (overall_confidence between 0 and 1),
  review_reasons_json jsonb not null default '[]'::jsonb,
  duplicate_of_document_id uuid references public.document_intelligence_documents(id) on delete set null,
  duplicate_confidence numeric(4,3) check (duplicate_confidence between 0 and 1),
  ferocity_expense_id uuid references public.operations_expenses(id) on delete set null,
  processing_error text,
  approved_by_user_id uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(vendor_name, '') || ' ' || coalesce(document_number, '') || ' ' ||
      coalesce(suggested_category, '') || ' ' || coalesce(extracted_text, '') || ' ' ||
      coalesce(normalized_json::text, ''))
  ) stored
);

create table if not exists public.document_intelligence_line_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.document_intelligence_documents(id) on delete cascade,
  position integer not null default 0,
  description text not null,
  product_code text,
  quantity numeric(14,4),
  unit text,
  unit_price_cents integer,
  discount_cents integer,
  tax_cents integer,
  total_cents integer,
  suggested_category text,
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.document_intelligence_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.document_intelligence_documents(id) on delete cascade,
  target_type text not null,
  target_ref text,
  target_label text not null,
  amount_cents integer,
  allocation_percent numeric(7,4),
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  rationale text,
  status text not null default 'suggested'
    check (status in ('suggested', 'confirmed', 'rejected')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_intelligence_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.document_intelligence_documents(id) on delete cascade,
  event_type text not null,
  actor_type text not null default 'system',
  actor_ref text,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists document_intelligence_documents_workspace_idx
  on public.document_intelligence_documents (tenant_id, source_product, status, created_at desc);
create index if not exists document_intelligence_documents_hash_idx
  on public.document_intelligence_documents (tenant_id, source_product, content_sha256);
create index if not exists document_intelligence_documents_search_idx
  on public.document_intelligence_documents using gin (search_vector);
create index if not exists document_intelligence_line_items_document_idx
  on public.document_intelligence_line_items (document_id, position);
create index if not exists document_intelligence_allocations_document_idx
  on public.document_intelligence_allocations (document_id, status);
create index if not exists document_intelligence_allocations_target_idx
  on public.document_intelligence_allocations (tenant_id, target_type, target_ref);

alter table public.document_intelligence_settings enable row level security;
alter table public.document_intelligence_documents enable row level security;
alter table public.document_intelligence_line_items enable row level security;
alter table public.document_intelligence_allocations enable row level security;
alter table public.document_intelligence_events enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'document_intelligence_settings',
    'document_intelligence_documents',
    'document_intelligence_line_items',
    'document_intelligence_allocations',
    'document_intelligence_events'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_tenant_operator', table_name);
    execute format(
      'create policy %I on public.%I for all using (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator''])) with check (public.has_tenant_role(tenant_id, array[''owner'', ''admin'', ''operator'']))',
      table_name || '_tenant_operator', table_name
    );
  end loop;
end $$;

comment on table public.document_intelligence_documents is
  'Product-neutral source documents and normalized extraction data used by Ferocity, H4R, and future adapters.';
comment on table public.document_intelligence_allocations is
  'Generic allocation targets supplied by each consuming product; target_type and target_ref are intentionally not Ferocity foreign keys.';

do $$
begin
  if to_regclass('public.feature_entitlements') is not null then
    insert into public.feature_entitlements (feature_key, feature_name, description, tier, status, metadata_json)
    values (
      'expense_document_intelligence',
      'Receipt & Expense Intelligence',
      'Extract, understand, allocate, search, deduplicate, review, and post expense documents with permanent source evidence.',
      'finance',
      'enabled',
      '{"sharedEngine":true,"ferocityAdapter":true,"h4rReady":true,"reviewFirst":true}'::jsonb
    )
    on conflict (feature_key) do update set
      feature_name = excluded.feature_name,
      description = excluded.description,
      tier = excluded.tier,
      status = excluded.status,
      metadata_json = public.feature_entitlements.metadata_json || excluded.metadata_json;
  end if;
end $$;
