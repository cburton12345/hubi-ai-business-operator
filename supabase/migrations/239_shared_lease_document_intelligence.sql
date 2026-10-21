-- Extends the shared document kernel for lease/contract/form analysis. AI output is
-- advisory: field suggestions never become executable lease fields without review.

alter table public.document_intelligence_documents
  add column if not exists purpose text not null default 'expense',
  add column if not exists source_document_ref text;

alter table public.document_intelligence_documents
  drop constraint if exists document_intelligence_documents_document_type_check;
alter table public.document_intelligence_documents
  add constraint document_intelligence_documents_document_type_check
  check (document_type in (
    'receipt','invoice','bill','purchase_order','warranty','credit_memo','statement',
    'lease','contract','form','other'
  ));

create unique index if not exists document_intelligence_external_source_unique
  on public.document_intelligence_documents (tenant_id,source_product,source_workspace_ref,source_document_ref,content_sha256)
  where source_document_ref is not null and status <> 'rejected';

create table if not exists public.document_intelligence_analyses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.document_intelligence_documents(id) on delete cascade,
  analysis_type text not null check (analysis_type in ('lease_terms_and_fields','contract_terms','form_fields')),
  status text not null default 'processing' check (status in ('processing','needs_review','ready','failed','rejected')),
  primary_result_json jsonb not null default '{}'::jsonb,
  reviewer_result_json jsonb,
  deterministic_issues_json jsonb not null default '[]'::jsonb,
  disagreements_json jsonb not null default '[]'::jsonb,
  human_review_required boolean not null default true,
  processing_error text,
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id,analysis_type)
);

create table if not exists public.document_intelligence_field_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  analysis_id uuid not null references public.document_intelligence_analyses(id) on delete cascade,
  source_key text not null,
  page_number integer not null check (page_number > 0),
  field_type text not null check (field_type in ('text','date','checkbox','initials','signature')),
  label text not null,
  signer_role text,
  proposed_value text,
  x numeric(8,7) not null check (x >= 0 and x <= 1),
  y numeric(8,7) not null check (y >= 0 and y <= 1),
  width numeric(8,7) not null check (width > 0 and width <= 1),
  height numeric(8,7) not null check (height > 0 and height <= 1),
  confidence numeric(4,3) not null default 0 check (confidence >= 0 and confidence <= 1),
  evidence text,
  status text not null default 'suggested' check (status in ('suggested','confirmed','rejected')),
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_id,source_key),
  check (x + width <= 1.0000001 and y + height <= 1.0000001)
);

create index if not exists document_intelligence_analyses_attention_idx
  on public.document_intelligence_analyses (tenant_id,status,human_review_required,created_at desc);
create index if not exists document_intelligence_field_suggestions_review_idx
  on public.document_intelligence_field_suggestions (tenant_id,analysis_id,status,page_number);

alter table public.document_intelligence_analyses enable row level security;
alter table public.document_intelligence_field_suggestions enable row level security;

drop policy if exists document_intelligence_analyses_tenant_operator on public.document_intelligence_analyses;
create policy document_intelligence_analyses_tenant_operator on public.document_intelligence_analyses for all
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

drop policy if exists document_intelligence_field_suggestions_tenant_operator on public.document_intelligence_field_suggestions;
create policy document_intelligence_field_suggestions_tenant_operator on public.document_intelligence_field_suggestions for all
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

comment on table public.document_intelligence_analyses is
  'Provider-neutral document analyses. Original source documents remain authoritative and analyses require product-specific review.';
comment on table public.document_intelligence_field_suggestions is
  'Untrusted AI field-placement suggestions; consuming products explicitly confirm or reject them before copying into executable workflows.';
