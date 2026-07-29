-- Close cost-control gaps without changing provider ownership or live-action
-- policy. Messaging estimates can retain sub-cent costs and storage uploads
-- must reserve workspace capacity before bytes are sent to the provider.

alter table public.messaging_usage
  alter column provider_cost_cents type numeric(14,4) using provider_cost_cents::numeric,
  alter column customer_charge_cents type numeric(14,4) using customer_charge_cents::numeric;

create table if not exists public.storage_quota_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  max_bytes bigint not null check (max_bytes >= 0),
  status text not null default 'active'
    check (status in ('active', 'paused', 'retired')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storage_usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bucket text not null,
  storage_key text not null,
  source_type text not null,
  source_id text,
  byte_count bigint not null check (byte_count >= 0),
  status text not null default 'reserved'
    check (status in ('reserved', 'active', 'failed', 'deleted')),
  idempotency_key text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists storage_usage_events_active_idx
  on public.storage_usage_events (tenant_id, status, created_at desc);

alter table public.storage_quota_policies enable row level security;
alter table public.storage_usage_events enable row level security;

drop policy if exists storage_quota_policies_tenant_operator on public.storage_quota_policies;
create policy storage_quota_policies_tenant_operator
on public.storage_quota_policies
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

drop policy if exists storage_usage_events_tenant_operator on public.storage_usage_events;
create policy storage_usage_events_tenant_operator
on public.storage_usage_events
for all
using (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']))
with check (public.has_tenant_role(tenant_id, array['owner', 'admin', 'operator']));

insert into public.storage_quota_policies (tenant_id, max_bytes, metadata_json)
select
  t.id,
  case coalesce(t.plan_key, 'free')
    when 'job_tracker' then 2147483648
    when 'starter' then 5368709120
    when 'growth' then 26843545600
    when 'operator' then 107374182400
    when 'managed_operator' then 107374182400
    when 'pro_agency' then 268435456000
    else 104857600
  end,
  jsonb_build_object('source', 'plan_safety_default', 'planKey', coalesce(t.plan_key, 'free'))
from public.tenants t
on conflict (tenant_id) do nothing;

create or replace function public.reserve_storage_usage(
  p_tenant_id uuid,
  p_bucket text,
  p_storage_key text,
  p_source_type text,
  p_source_id text,
  p_byte_count bigint,
  p_idempotency_key text,
  p_metadata_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  policy_row public.storage_quota_policies%rowtype;
  used_bytes bigint;
  event_id uuid;
begin
  insert into public.storage_quota_policies (tenant_id, max_bytes, metadata_json)
  select
    t.id,
    case coalesce(t.plan_key, 'free')
      when 'job_tracker' then 2147483648
      when 'starter' then 5368709120
      when 'growth' then 26843545600
      when 'operator' then 107374182400
      when 'managed_operator' then 107374182400
      when 'pro_agency' then 268435456000
      else 104857600
    end,
    jsonb_build_object('source', 'lazy_plan_safety_default', 'planKey', coalesce(t.plan_key, 'free'))
  from public.tenants t
  where t.id = p_tenant_id
  on conflict (tenant_id) do nothing;

  select * into policy_row
  from public.storage_quota_policies
  where tenant_id = p_tenant_id and status = 'active'
  for update;

  if policy_row.id is null or p_byte_count < 0 then
    return null;
  end if;

  select coalesce(sum(byte_count), 0) into used_bytes
  from public.storage_usage_events
  where tenant_id = p_tenant_id and status in ('reserved', 'active');

  if used_bytes + p_byte_count > policy_row.max_bytes then
    return null;
  end if;

  insert into public.storage_usage_events (
    tenant_id, bucket, storage_key, source_type, source_id, byte_count,
    status, idempotency_key, metadata_json
  )
  values (
    p_tenant_id, p_bucket, p_storage_key, p_source_type, p_source_id,
    p_byte_count, 'reserved', p_idempotency_key, coalesce(p_metadata_json, '{}'::jsonb)
  )
  on conflict (tenant_id, idempotency_key) do update
    set updated_at = now()
  returning id into event_id;

  return event_id;
end;
$$;

revoke all on function public.reserve_storage_usage(uuid, text, text, text, text, bigint, text, jsonb) from public;
