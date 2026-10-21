create table if not exists public.document_intelligence_email_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  batch_id uuid not null references public.document_intelligence_import_batches(id) on delete cascade,
  provider_message_id text not null,
  provider_attachment_id text not null,
  file_index integer not null check (file_index >= 0),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  mime_type text not null check (char_length(btrim(mime_type)) between 1 and 200),
  byte_count bigint not null check (byte_count > 0 and byte_count <= 15728640),
  supplied_text text,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,provider_message_id,provider_attachment_id),
  unique (batch_id,file_index)
);

create index if not exists document_intelligence_email_jobs_due_idx
  on public.document_intelligence_email_jobs (status,next_attempt_at,created_at)
  where status in ('pending','processing');
create index if not exists document_intelligence_email_jobs_tenant_idx
  on public.document_intelligence_email_jobs (tenant_id,created_at desc);

alter table public.document_intelligence_email_jobs enable row level security;
drop policy if exists document_intelligence_email_jobs_tenant_operator on public.document_intelligence_email_jobs;
create policy document_intelligence_email_jobs_tenant_operator
on public.document_intelligence_email_jobs for all
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

revoke all on table public.document_intelligence_email_jobs
from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.document_intelligence_email_jobs
to authenticated, service_role;

comment on table public.document_intelligence_email_jobs is
  'Durable per-attachment Resend ingestion queue. Webhooks acknowledge quickly while background workers preserve independent outcomes and bounded retries.';
