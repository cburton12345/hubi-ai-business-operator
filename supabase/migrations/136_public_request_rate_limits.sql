create table if not exists public.public_request_rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  requester_fingerprint text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, requester_fingerprint, window_started_at)
);

create index if not exists public_request_rate_limits_expiry_idx
  on public.public_request_rate_limits (expires_at);

alter table public.public_request_rate_limits enable row level security;
revoke all on table public.public_request_rate_limits from public, anon, authenticated;

comment on table public.public_request_rate_limits is
  'Server-only abuse controls. Requester identifiers are HMAC-pseudonymized; raw IP addresses are not stored here.';
