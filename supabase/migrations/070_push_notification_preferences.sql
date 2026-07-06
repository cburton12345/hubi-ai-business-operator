create table if not exists public.push_notification_preferences (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  owner_alerts_enabled boolean not null default true,
  min_severity text not null default 'high' check (min_severity in ('info', 'low', 'medium', 'high', 'critical')),
  min_money_cents integer not null default 10000 check (min_money_cents >= 0),
  notify_revenue boolean not null default true,
  notify_financial boolean not null default true,
  notify_customer boolean not null default true,
  notify_legal boolean not null default true,
  notify_safety boolean not null default true,
  notify_automation boolean not null default true,
  notify_low_confidence boolean not null default true,
  notify_approval boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_notification_preferences enable row level security;

drop policy if exists push_notification_preferences_no_public_read on public.push_notification_preferences;
create policy push_notification_preferences_no_public_read
on public.push_notification_preferences
for select
using (false);

create or replace function public.set_push_notification_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_notification_preferences_touch_updated_at on public.push_notification_preferences;
create trigger push_notification_preferences_touch_updated_at
before update on public.push_notification_preferences
for each row
execute function public.set_push_notification_preferences_updated_at();
