create table if not exists public.owner_twin_suggestion_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  suggestion_key text not null check (suggestion_key ~ '^[a-f0-9]{32}$'),
  command text not null check (length(command) between 2 and 500),
  channel text not null check (channel in ('internal_command','email','text','phone','vendor','work_order')),
  feedback text not null check (feedback in ('accepted','dismissed')),
  evidence_href text not null check (evidence_href like '/app/%'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '365 days'),
  unique (tenant_id, user_id, suggestion_key)
);

create index if not exists owner_twin_feedback_active_idx
  on public.owner_twin_suggestion_feedback (tenant_id, user_id, feedback, expires_at, updated_at desc);

alter table public.owner_twin_suggestion_feedback enable row level security;
revoke all on table public.owner_twin_suggestion_feedback from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.owner_twin_suggestion_feedback to service_role;

comment on table public.owner_twin_suggestion_feedback is
  'Tenant/user-scoped accept/dismiss evidence for governed owner suggestions. Server-mediated only; expires after 365 days and never grants action authority.';
