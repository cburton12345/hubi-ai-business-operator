create table if not exists public.platform_runtime_leases (
  lease_key text primary key,
  holder_id uuid not null,
  leased_until timestamptz not null,
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb
);

create index if not exists platform_runtime_leases_expiry_idx
  on public.platform_runtime_leases (leased_until);

alter table public.platform_runtime_leases enable row level security;
revoke all on table public.platform_runtime_leases from public, anon, authenticated;

comment on table public.platform_runtime_leases is
  'Server-only expiring leases that prevent scheduled automation runs from overlapping during traffic spikes or provider delays.';
