-- Add short-window provider-risk controls to the existing tenant messaging
-- account. This preserves the current provider, routing, history, consent, and
-- usage systems instead of introducing a parallel communications stack.

alter table public.tenant_messaging_accounts
  add column if not exists hourly_send_cap integer default 100
    check (hourly_send_cap is null or hourly_send_cap >= 0),
  add column if not exists daily_send_cap integer default 500
    check (daily_send_cap is null or daily_send_cap >= 0),
  add column if not exists per_recipient_hourly_cap integer default 5
    check (per_recipient_hourly_cap is null or per_recipient_hourly_cap >= 0),
  add column if not exists recent_failure_cap integer default 10
    check (recent_failure_cap is null or recent_failure_cap >= 0),
  add column if not exists risk_window_minutes integer not null default 15
    check (risk_window_minutes between 1 and 1440),
  add column if not exists emergency_paused boolean not null default false;

update public.tenant_messaging_accounts
set
  hourly_send_cap = coalesce(hourly_send_cap, 100),
  daily_send_cap = coalesce(daily_send_cap, 500),
  per_recipient_hourly_cap = coalesce(per_recipient_hourly_cap, 5),
  recent_failure_cap = coalesce(recent_failure_cap, 10),
  risk_window_minutes = coalesce(risk_window_minutes, 15)
where ownership_mode <> 'manual_assisted';

update public.tenant_messaging_accounts
set
  hourly_send_cap = null,
  daily_send_cap = null,
  recent_failure_cap = null
where ownership_mode = 'manual_assisted';

create index if not exists messages_tenant_provider_velocity_idx
  on public.messages (tenant_id, provider_key, created_at desc)
  where direction = 'outbound' and status in ('queued', 'sent', 'delivered');

create index if not exists messages_tenant_recipient_velocity_idx
  on public.messages (tenant_id, provider_key, lower(to_value), created_at desc)
  where direction = 'outbound' and status in ('queued', 'sent', 'delivered');

comment on column public.tenant_messaging_accounts.emergency_paused is
  'Tenant/provider circuit breaker. Live sends remain blocked until an authorized workspace admin clears the pause and reactivates the account.';

comment on column public.tenant_messaging_accounts.recent_failure_cap is
  'Maximum provider failures during risk_window_minutes before the tenant/provider account is automatically isolated.';

