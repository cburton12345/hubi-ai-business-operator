create table if not exists public.public_site_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null default 'page_view'
    check (event_type in ('page_view', 'cta_click')),
  path text not null,
  referrer_host text,
  campaign_source text,
  campaign_medium text,
  campaign_name text,
  device_class text,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists public_site_events_occurred_idx
  on public.public_site_events (occurred_at desc);
create index if not exists public_site_events_path_occurred_idx
  on public.public_site_events (path, occurred_at desc);

alter table public.public_site_events enable row level security;
revoke all on table public.public_site_events from public, anon, authenticated;

comment on table public.public_site_events is
  'Privacy-minimized first-party marketing analytics. Stores page/campaign context but no raw IP, name, email, cookie identifier, or full referrer URL.';
