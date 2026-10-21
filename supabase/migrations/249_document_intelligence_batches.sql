-- Preserve upload-session truth separately from document identity. A document may
-- appear in more than one batch without duplicating its private source object.
create table if not exists public.document_intelligence_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  project_type text not null default 'general'
    check (project_type in ('general','tax_year','property','job','customer')),
  tax_year integer check (tax_year between 2000 and 2200),
  status text not null default 'active' check (status in ('active','archived')),
  created_by_user_id uuid references public.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,name)
);

create table if not exists public.document_intelligence_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid references public.document_intelligence_projects(id) on delete set null,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  source_channel text not null default 'upload'
    check (source_channel in ('camera','upload','drag_drop','email','api','mobile','other')),
  status text not null default 'processing'
    check (status in ('processing','completed','partial','failed')),
  expected_file_count integer not null check (expected_file_count between 1 and 50),
  imported_file_count integer not null default 0 check (imported_file_count >= 0),
  reused_file_count integer not null default 0 check (reused_file_count >= 0),
  failed_file_count integer not null default 0 check (failed_file_count >= 0),
  created_by_user_id uuid references public.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_intelligence_import_batch_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  batch_id uuid not null references public.document_intelligence_import_batches(id) on delete cascade,
  file_index integer not null check (file_index >= 0),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  mime_type text,
  byte_count bigint check (byte_count is null or byte_count > 0),
  document_id uuid references public.document_intelligence_documents(id) on delete set null,
  outcome text not null check (outcome in ('imported','reused','failed')),
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id,file_index)
);

create index if not exists document_intelligence_projects_tenant_idx
  on public.document_intelligence_projects (tenant_id,status,updated_at desc);
create index if not exists document_intelligence_import_batches_tenant_idx
  on public.document_intelligence_import_batches (tenant_id,status,created_at desc);
create index if not exists document_intelligence_import_batches_project_idx
  on public.document_intelligence_import_batches (tenant_id,project_id,created_at desc);
create index if not exists document_intelligence_import_batch_items_document_idx
  on public.document_intelligence_import_batch_items (tenant_id,document_id,batch_id);

alter table public.document_intelligence_projects enable row level security;
alter table public.document_intelligence_import_batches enable row level security;
alter table public.document_intelligence_import_batch_items enable row level security;

drop policy if exists document_intelligence_projects_tenant_operator on public.document_intelligence_projects;
create policy document_intelligence_projects_tenant_operator
on public.document_intelligence_projects for all
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy if exists document_intelligence_import_batches_tenant_operator on public.document_intelligence_import_batches;
create policy document_intelligence_import_batches_tenant_operator
on public.document_intelligence_import_batches for all
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy if exists document_intelligence_import_batch_items_tenant_operator on public.document_intelligence_import_batch_items;
create policy document_intelligence_import_batch_items_tenant_operator
on public.document_intelligence_import_batch_items for all
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

comment on table public.document_intelligence_import_batches is
  'One immutable user-visible upload session. Expected and resolved file counts prevent silently omitted uploads.';
comment on table public.document_intelligence_import_batch_items is
  'Per-selected-file outcome. Reused documents remain linked to every batch in which they appeared.';
