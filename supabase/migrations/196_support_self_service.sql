-- Track support guidance separately from escalated cases so Ferocity can learn
-- which issues its AI support agent resolves without creating admin work.

create table if not exists public.support_self_service_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  provider_key text not null,
  provider_call_id text not null,
  issue_type text not null,
  problem_summary text not null,
  guidance_key text not null,
  outcome text not null default 'guidance_offered'
    check (outcome in ('guidance_offered', 'solved', 'not_solved', 'escalation_required', 'abandoned')),
  escalation_required boolean not null default false,
  resolution_notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_key, provider_call_id, guidance_key)
);

create index if not exists support_self_service_events_outcome_idx
  on public.support_self_service_events (outcome, created_at desc);
alter table public.support_self_service_events enable row level security;
revoke all on table public.support_self_service_events from public, anon, authenticated;

comment on table public.support_self_service_events is
  'Server-only AI support guidance and confirmed outcomes. Sensitive account actions still require verified identity and separate authorization.';
