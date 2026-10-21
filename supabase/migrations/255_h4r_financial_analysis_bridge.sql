-- Read-only source analysis; no Ferocity or H4R ledger posting.
create table public.h4r_financial_document_analyses (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 h4r_workspace_id uuid not null,
 h4r_document_id uuid not null,
 source_sha256 text not null,
 status text not null default 'processing' check(status in ('processing','needs_review','failed')),
 result_json jsonb,
 processing_error text,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique(tenant_id,h4r_workspace_id,h4r_document_id,source_sha256)
);
alter table public.h4r_financial_document_analyses enable row level security;
revoke all on table public.h4r_financial_document_analyses
from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.h4r_financial_document_analyses
to service_role;
