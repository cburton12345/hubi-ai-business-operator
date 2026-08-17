create table if not exists public.in_app_notification_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  source_type text not null check (source_type in ('owner_event','ai_work','approval','provider_request','funding_alert')),
  source_id uuid not null,
  status text not null default 'unread' check (status in ('unread','read','acknowledged','dismissed')),
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, source_type, source_id)
);

create index if not exists idx_in_app_notification_states_user
  on public.in_app_notification_states(tenant_id, user_id, status, updated_at desc);

alter table public.in_app_notification_states enable row level security;
drop policy if exists in_app_notification_states_member on public.in_app_notification_states;
create policy in_app_notification_states_member on public.in_app_notification_states
for all
using (user_id = auth.uid() and public.has_tenant_role(tenant_id, array['owner','admin','operator','viewer']))
with check (user_id = auth.uid() and public.has_tenant_role(tenant_id, array['owner','admin','operator','viewer']));

create table if not exists public.voice_agent_profile_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.office_manager_profiles(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  snapshot_json jsonb not null,
  change_source text not null default 'owner_edit',
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (profile_id, version_number)
);

create index if not exists idx_voice_agent_profile_versions_profile
  on public.voice_agent_profile_versions(tenant_id, profile_id, version_number desc);

alter table public.voice_agent_profile_versions enable row level security;
drop policy if exists voice_agent_profile_versions_operator on public.voice_agent_profile_versions;
create policy voice_agent_profile_versions_operator on public.voice_agent_profile_versions
for all
using (public.has_tenant_role(tenant_id, array['owner','admin','operator']))
with check (public.has_tenant_role(tenant_id, array['owner','admin','operator']));
