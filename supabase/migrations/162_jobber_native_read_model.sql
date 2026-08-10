create table if not exists public.external_service_platform_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  provider_key text not null,
  object_type text not null,
  external_id text not null,
  external_version text,
  display_name text not null default '',
  record_status text,
  amount numeric(14,2),
  web_url text,
  related_external_ids_json jsonb not null default '{}'::jsonb,
  summary_json jsonb not null default '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  provider_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, object_type, external_id)
);

create index if not exists external_service_platform_records_analysis_idx
  on public.external_service_platform_records(tenant_id, provider_key, object_type, record_status)
  where provider_deleted_at is null;

alter table public.external_service_platform_records enable row level security;

drop policy if exists external_service_platform_records_tenant on public.external_service_platform_records;
create policy external_service_platform_records_tenant
on public.external_service_platform_records
for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin']));

comment on table public.external_service_platform_records is
  'Read-only, provider-owned summaries used by Ferocity analysis. This is not a second operational system and never enables write-back by itself.';
