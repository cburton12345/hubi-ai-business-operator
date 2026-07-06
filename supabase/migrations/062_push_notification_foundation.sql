create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  permission text not null default 'granted' check (permission in ('granted','denied','default')),
  status text not null default 'active' check (status in ('active','paused','expired','failed','revoked')),
  user_agent text,
  device_label text,
  metadata_json jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_tenant_status
  on public.push_subscriptions(tenant_id, status, updated_at desc);

create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions(user_id, updated_at desc);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_no_public_read on public.push_subscriptions;
create policy push_subscriptions_no_public_read
on public.push_subscriptions
for select
using (false);

create table if not exists public.push_notification_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  event_type text not null,
  title text not null,
  body text not null,
  action_url text,
  status text not null default 'queued' check (status in ('queued','sent','skipped','failed')),
  provider_response text,
  error_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_notification_events_tenant_created
  on public.push_notification_events(tenant_id, created_at desc);

alter table public.push_notification_events enable row level security;

drop policy if exists push_notification_events_no_public_read on public.push_notification_events;
create policy push_notification_events_no_public_read
on public.push_notification_events
for select
using (false);

create or replace function public.set_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_subscriptions_touch_updated_at on public.push_subscriptions;
create trigger push_subscriptions_touch_updated_at
before update on public.push_subscriptions
for each row
execute function public.set_push_subscriptions_updated_at();
