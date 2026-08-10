create table if not exists public.platform_admin_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  fingerprint text not null unique,
  alert_family text not null,
  alert_type text not null,
  severity text not null check (severity in ('info','warning','high','critical')),
  status text not null default 'active' check (status in ('active','acknowledged','resolved')),
  title text not null,
  body text not null,
  action_url text,
  occurrence_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_notified_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_admin_alerts_active_idx
  on public.platform_admin_alerts (status, severity, last_seen_at desc);

alter table public.platform_admin_alerts enable row level security;
revoke all on table public.platform_admin_alerts from public, anon, authenticated;

comment on table public.platform_admin_alerts is
  'Deduplicated platform-owner alerts for provider failures, customer requests, capacity risk, security, billing, and operational exceptions.';
