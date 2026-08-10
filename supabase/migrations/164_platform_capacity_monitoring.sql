create table if not exists public.platform_capacity_snapshots (
  id uuid primary key default gen_random_uuid(),
  database_connections integer,
  database_max_connections integer,
  database_connection_percent numeric(8,3),
  due_action_count integer not null default 0,
  failed_action_count integer not null default 0,
  recent_error_count integer not null default 0,
  status text not null check (status in ('healthy', 'watch', 'high', 'critical', 'unknown')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_capacity_alerts (
  id uuid primary key default gen_random_uuid(),
  signal_key text not null unique,
  status text not null default 'active' check (status in ('active', 'resolved')),
  severity text not null check (severity in ('watch', 'high', 'critical')),
  title text not null,
  summary text not null,
  metric_value numeric,
  threshold_value numeric,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists platform_capacity_snapshots_created_idx
  on public.platform_capacity_snapshots (created_at desc);

create index if not exists outbound_action_queue_global_due_idx
  on public.outbound_action_queue (status, scheduled_for, tenant_id)
  where status in ('approved', 'queued', 'failed');

create index if not exists operator_timeline_automation_rotation_idx
  on public.operator_timeline_events (event_type, tenant_id, occurred_at desc)
  where event_type = 'business_automation_loop';

alter table public.platform_capacity_snapshots enable row level security;
alter table public.platform_capacity_alerts enable row level security;
revoke all on table public.platform_capacity_snapshots from public, anon, authenticated;
revoke all on table public.platform_capacity_alerts from public, anon, authenticated;

comment on table public.platform_capacity_alerts is
  'Server-only 50/70/85 percent capacity alerts. Provider and tenant emergency controls remain isolated from unrelated platform capabilities.';
