create table if not exists public.email_inbound_routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  address text not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'disabled')),
  default_lead_source text not null default 'email_inbound',
  metadata_json jsonb not null default '{}'::jsonb,
  last_received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (address)
);

create index if not exists idx_email_inbound_routes_tenant_status
  on public.email_inbound_routes(tenant_id, status, address);

create unique index if not exists idx_communication_messages_provider_email
  on public.communication_messages(provider_message_id)
  where channel = 'email' and provider_message_id is not null;

alter table public.email_inbound_routes enable row level security;

drop policy if exists email_inbound_routes_tenant_admin on public.email_inbound_routes;
create policy email_inbound_routes_tenant_admin
on public.email_inbound_routes
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin']));

insert into public.email_inbound_routes (tenant_id, brand_id, address, metadata_json)
select
  b.tenant_id,
  b.id,
  lower(b.email),
  jsonb_build_object('source', 'brand_email_seed', 'brandName', b.name)
from public.brands b
where b.email is not null and btrim(b.email) <> ''
on conflict (address) do nothing;
