create table if not exists public.website_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  website_url text not null,
  normalized_origin text not null,
  display_name text,
  connection_mode text not null default 'public_scan'
    check (connection_mode in ('public_scan','ferocity_hosted','install_snippet','cms_oauth','api_key','git_deploy','signed_webhook','manual_export')),
  provider_key text,
  status text not null default 'needs_verification'
    check (status in ('needs_verification','verified_read_only','needs_connection','connected_draft_only','connected_live','needs_attention','disconnected')),
  verification_method text,
  capabilities_json jsonb not null default '[]'::jsonb,
  last_scan_json jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  last_error text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, normalized_origin)
);

create index if not exists website_connections_tenant_status_idx
  on public.website_connections (tenant_id, status, updated_at desc);

alter table public.website_connections enable row level security;

drop policy if exists website_connections_tenant_member on public.website_connections;
create policy website_connections_tenant_member
  on public.website_connections
  for select
  using (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

drop policy if exists website_connections_tenant_operator on public.website_connections;
create policy website_connections_tenant_operator
  on public.website_connections
  for all
  using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
  with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

comment on table public.website_connections is
  'Tenant-scoped website ownership, connection mode, verified capabilities, and health. A domain is an address; provider/CMS adapters remain separate.';
