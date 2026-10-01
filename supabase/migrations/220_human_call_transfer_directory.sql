create table if not exists public.call_transfer_destinations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  label text not null,
  routing_role text not null default 'general'
    check (routing_role in ('general','owner','office','sales','service','billing','emergency','on_call')),
  phone_number text not null check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  priority integer not null default 100 check (priority between 1 and 999),
  weekdays_json jsonb not null default '[1,2,3,4,5]'::jsonb,
  available_start time,
  available_end time,
  timezone text not null default 'America/Chicago',
  is_primary boolean not null default false,
  is_active boolean not null default true,
  authorization_confirmed_at timestamptz not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, phone_number, routing_role)
);

create index if not exists call_transfer_destinations_route_idx
  on public.call_transfer_destinations (tenant_id, brand_id, is_active, priority);

create unique index if not exists call_transfer_destinations_primary_idx
  on public.call_transfer_destinations (
    tenant_id,
    coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) where is_primary = true and is_active = true;

alter table public.call_transfer_destinations enable row level security;

drop policy if exists call_transfer_destinations_tenant_operator on public.call_transfer_destinations;
create policy call_transfer_destinations_tenant_operator
on public.call_transfer_destinations
for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));

insert into public.call_transfer_destinations (
  tenant_id, label, routing_role, phone_number, priority, is_primary,
  authorization_confirmed_at, metadata_json
)
select pc.tenant_id, 'Primary human', 'general', pc.human_transfer_number, 100, true,
       now(), '{"source":"phone_connection_migration"}'::jsonb
from public.phone_connections pc
where pc.human_transfer_number ~ '^\+[1-9][0-9]{7,14}$'
on conflict (tenant_id, phone_number, routing_role) do nothing;
