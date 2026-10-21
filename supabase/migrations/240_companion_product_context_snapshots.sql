-- Minimized, immutable context snapshots from authoritative companion products.
-- These aggregates inform Ferocity's brain and goals without copying the source
-- product's ledgers, payments, identities, leases, or signature records.

create table if not exists public.companion_product_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_key text not null,
  external_workspace_id text not null,
  schema_version integer not null default 1 check (schema_version > 0),
  source_generated_at timestamptz not null,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'captured' check (status in ('captured','superseded','failed')),
  metrics_json jsonb not null default '{}'::jsonb,
  domain_state_json jsonb not null default '{}'::jsonb,
  capabilities_json jsonb not null default '{}'::jsonb,
  blind_spots_json jsonb not null default '[]'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id,product_key,external_workspace_id,source_generated_at,source_hash),
  unique (tenant_id,id)
);

create index if not exists companion_product_context_latest_idx
  on public.companion_product_context_snapshots(tenant_id,product_key,external_workspace_id,source_generated_at desc);
create index if not exists companion_product_context_hash_idx
  on public.companion_product_context_snapshots(tenant_id,product_key,external_workspace_id,source_hash);

alter table public.companion_product_context_snapshots enable row level security;
drop policy if exists companion_product_context_snapshots_tenant_operator on public.companion_product_context_snapshots;
create policy companion_product_context_snapshots_tenant_operator
on public.companion_product_context_snapshots for select
using (public.has_tenant_role(tenant_id,array['owner','admin','operator']));

revoke all on table public.companion_product_context_snapshots from anon, authenticated;
grant select on table public.companion_product_context_snapshots to authenticated;

comment on table public.companion_product_context_snapshots is
  'Minimized aggregate context consumed by Ferocity. The companion product remains authoritative and no source-domain write authority is implied.';
